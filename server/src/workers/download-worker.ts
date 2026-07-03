import { WorkersRepo } from './workers.repo';
import logger from '@server/lib/logger';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { promises as fs } from 'fs';
import { FileManagementService } from '@server/features/file-management/file-management.service';
import { TelegramAdapter } from '@server/external/adapters/telegram/telegram.adapter';
import { formatErrorMessage } from '@server/lib/error-message';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import type { EventJournalPort } from '@server/features/event-journal/event-journal.port';

// In-memory cache for the last known Transmission status per torrent item
export const statusStorage = new Map<number, NormalizedTorrent | undefined>();

export class DownloadWorker {
  // Database repository for reading items and updating statuses
  private readonly repo: WorkersRepo;
  private readonly eventJournal: EventJournalPort;
  // Internal scheduler tick (ms)
  private timerMs: number;
  // Cached user settings used during processing
  private settings: DbUserSettings | undefined;
  // Handle for the active interval; used to prevent duplicate schedulers
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private error: string | null = null;
  private isProcessing = false;

  constructor({
    repo,
    eventJournal,
  }: {
    repo?: WorkersRepo;
    eventJournal?: EventJournalPort;
  }) {
    // Default polling cadence for download processing
    this.timerMs = 5000;
    this.repo = repo || new WorkersRepo();
    this.eventJournal = eventJournal || new EventJournalService();
  }

  // Load and cache current user settings
  private async getSetting() {
    const settings = await this.repo.findSettings();
    if (!settings) throw new Error('No settings found');
    this.settings = settings;
    return settings;
  }

  // Transition item from request to active download in Transmission
  async startDownload(row: DbTorrentItem) {
    logger.info(`[DownloadWorker] Start downloading ${row.title}`);
    const client = new TransmissionAdapter({
      id: row.id,
      torrentItem: row,
    });
    try {
      await client.add();
      await this.eventJournal.recordTorrentDownloadStarted({
        torrentItem: row,
        message: 'Download started',
      });
    } catch (e) {
      logger.error(`[DownloadWorker] Failed to start downloading ${row.title}`);
      logger.error(e);
      this.error =
        'DownloadWorker: Failed to start downloading, ' + formatErrorMessage(e);
      await this.eventJournal.recordTorrentDownloadFailed({
        torrentItem: row,
        errorMessage: this.error,
      });
    }
  }

  // Poll Transmission for current status and act accordingly
  async processDownloading(row: DbTorrentItem) {
    const client = new TransmissionAdapter({
      id: row.id,
      torrentItem: row,
    });
    let status: NormalizedTorrent | undefined;
    try {
      status = await client.status();
      if (status) statusStorage.set(row.id, status);
    } catch (e) {
      logger.error(
        `[DownloadWorker] Failed to check download status ${row.title}: ${e}`,
      );
      if (e instanceof Error && e.message.includes('Torrent not found')) {
        logger.error(
          `[DownloadWorker] Torrent ${row.title} not found, looks like it was removed from Transmission. Mark as idle.`,
        );
        await this.repo.markAsIdle(row.id);
        statusStorage.delete(row.id);
      }
      this.error =
        'DownloadWorker: Failed to check download status, ' +
        formatErrorMessage(e);
      await this.eventJournal.recordTorrentDownloadFailed({
        torrentItem: row,
        errorMessage: this.error,
      });
      return;
    }
    if (!status) return;
    const isDone = Boolean(
      status?.isCompleted &&
        status.dateCompleted &&
        new Date(status.dateCompleted).getTime() > 0,
    );
    if (isDone) {
      // Mark as completed to move processing to the next stage
      await this.repo.markAsCompleted(row.id);
      await this.eventJournal.recordTorrentDownloadCompleted({
        torrentItem: row,
        message: 'Download completed',
      });
      statusStorage.delete(row.id);
    } else {
      try {
        // Select only tracked episodes in Transmission to optimize downloads
        await client.selectEpisodes(status);
        statusStorage.set(row.id, status);
      } catch (e) {
        logger.error(
          `[DownloadWorker] Error selecting episodes for ${row.title}: ${e}`,
        );
        if (status) logger.error(JSON.stringify(status, null, 2));
        this.error =
          'DownloadWorker: Error selecting episodes, ' + formatErrorMessage(e);
        await this.eventJournal.recordTorrentDownloadFailed({
          torrentItem: row,
          errorMessage: this.error,
        });
      }
    }
  }

  // After download finishes, copy files to the media library and remove from Transmission
  async processCompletedDownload(row: DbTorrentItem) {
    const client = new TransmissionAdapter({
      id: row.id,
      torrentItem: row,
    });
    logger.info(
      `[DownloadWorker] Processing completed download for ${row.title}`,
    );
    await this.repo.markAsProcessing(row.id);
    try {
      if (!this.settings) {
        logger.error(`[DownloadWorker] Settings not found`);
        return;
      }
      await this.eventJournal.recordTorrentFileCopyStarted({
        torrentItem: row,
        message: 'File copy started',
      });
      const copyResult = await new FileManagementService().copyTrackedEpisodes(
        row,
        this.settings,
      );
      const episodes = Object.keys(copyResult);
      const files = Object.values(copyResult);
      const existingFiles = Array.isArray(row.files)
        ? (row.files as string[])
        : [];
      const newFiles = files.filter((x) => !existingFiles.includes(x));
      await this.repo.update(row.id, {
        files: [...newFiles, ...existingFiles],
        trackedEpisodes: [
          ...(row?.trackedEpisodes as number[]).filter(
            (x) => !episodes.includes(x.toString()),
          ),
        ],
      });
      await this.eventJournal.recordTorrentFileCopyCompleted({
        torrentItem: row,
        message: formatCopiedFilesMessage(newFiles),
      });
      if (this.settings?.telegramId && this.settings?.botToken)
        new TelegramAdapter(this.settings).sendUpdate(row.title, copyResult);
    } catch (e) {
      logger.error(e);
      await this.repo.markAsIdle(row.id);
      this.error =
        'DownloadWorker: Error processing completed download, ' +
        formatErrorMessage(e);
      await this.eventJournal.recordTorrentFileCopyFailed({
        torrentItem: row,
        errorMessage: this.error,
      });
      return;
    }
    if (this.settings?.deleteAfterDownload) {
      await client.remove(true);
      logger.info(`[DownloadWorker] Torrent removed from Transmission`);
    }
  }

  private async checkFiles(row: DbTorrentItem) {
    const files = Array.isArray(row.files) ? (row.files as string[]) : [];
    if (!files.length) return;

    const existingFiles: string[] = [];
    const missingFiles: string[] = [];

    for (const file of files) {
      try {
        const st = await fs.stat(file);
        if (st.isFile()) {
          existingFiles.push(file);
        } else {
          missingFiles.push(file);
          logger.warn(`[DownloadWorker] Path is not a regular file: ${file}`);
        }
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          missingFiles.push(file);
          logger.warn(`[DownloadWorker] File not found: ${file}`);
        } else {
          logger.error(
            `[DownloadWorker] Unexpected error while statting ${file}: ${String(
              e,
            )}`,
          );
          existingFiles.push(file);
        }

        this.error =
          'DownloadWorker: Failed to check files, ' + formatErrorMessage(e);
      }
    }

    if (missingFiles.length) {
      await this.repo.update(row.id, { files: existingFiles });
      logger.warn(
        `[DownloadWorker] Removed ${missingFiles.length} missing file(s) from DB for item ${row.title}`,
      );
    }
  }

  // Entry point for a single polling iteration
  async process() {
    if (this.isProcessing) {
      logger.warn('[DownloadWorker] Process already in progress');
      return;
    }
    this.isProcessing = true;
    try {
      await this.getSetting();
      const rows = await this.repo.findAllNeedToControl();
      if (!rows) return;
      for (const row of rows) {
        this.error = null;
        switch (row.controlStatus) {
          case 'downloadRequested':
            await this.startDownload(row);
            break;
          case 'downloading':
            await this.processDownloading(row);
            break;
          case 'downloadCompleted':
            await this.processCompletedDownload(row);
            break;
          case 'idle':
          case 'paused':
            if (
              process.env.HOOP_LAST_SYNC &&
              parseInt(process.env.HOOP_LAST_SYNC) <= Date.now()
            )
              await this.checkFiles(row);
            break;
        }
        if (this.error) {
          logger.error(
            `[DownloadWorker] Error on process ${row.id}: ${this.error}`,
          );
          await this.repo.update(row.id, { errorMessage: this.error });
          this.error = null;
        } else if (row.errorMessage) {
          const msg = String(row.errorMessage);
          const isUpdateWorkerError = msg.startsWith('UpdateWorker:');
          if (!isUpdateWorkerError) {
            await this.repo.update(row.id, { errorMessage: null });
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Start the scheduler; ensures only one active interval exists
  async run() {
    logger.info('[DownloadWorker] Start');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.intervalId = setInterval(async () => {
      try {
        await this.process();
      } catch (e) {
        logger.error(`[DownloadWorker] Error on process: ${e}`);
      }
    }, this.timerMs);
  }
}

function formatCopiedFilesMessage(files: string[]): string {
  const title = `Copied ${files.length} file(s)`;
  if (!files.length) return title;
  return [title, ...files].join('\n');
}
