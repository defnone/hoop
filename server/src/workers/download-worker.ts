import { WorkersRepo } from './workers.repo';
import logger from '@server/lib/logger';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { promises as fs } from 'fs';
import { FileManagementService } from '@server/features/file-management/file-management.service';
import { TelegramAdapter } from '@server/external/adapters/telegram/telegram.adapter';

// In-memory cache for the last known Transmission status per torrent item
export const statusStorage = new Map<number, NormalizedTorrent | undefined>();

export class DownloadWorker {
  // Database repository for reading items and updating statuses
  private readonly repo: WorkersRepo;
  // Internal scheduler tick (ms)
  private timerMs: number;
  // Cached user settings used during processing
  private settings: DbUserSettings | undefined;
  // Handle for the active interval; used to prevent duplicate schedulers
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor({ repo }: { repo?: WorkersRepo }) {
    // Default polling cadence for download processing
    this.timerMs = 5000;
    this.repo = repo || new WorkersRepo();
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
    } catch (e) {
      logger.error(`[DownloadWorker] Failed to start downloading ${row.title}`);
      logger.error(e);
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
        `[DownloadWorker] Failed to check download status ${row.title}: ${e}`
      );
      if (e instanceof Error && e.message.includes('Torrent not found')) {
        logger.error(
          `[DownloadWorker] Torrent ${row.title} not found, looks like it was removed from Transmission. Mark as idle.`
        );
        await this.repo.markAsIdle(row.id);
        statusStorage.delete(row.id);
      }
    }
    const isDone = Boolean(
      status?.isCompleted &&
        status.dateCompleted &&
        new Date(status.dateCompleted).getTime() > 0
    );
    if (isDone) {
      // Mark as completed to move processing to the next stage
      await this.repo.markAsCompleted(row.id);
      statusStorage.delete(row.id);
    } else {
      try {
        // Select only tracked episodes in Transmission to optimize downloads
        await client.selectEpisodes();
        statusStorage.set(row.id, status);
      } catch (e) {
        logger.error(
          `[DownloadWorker] Error selecting episodes for ${row.title}: ${e}`
        );
        if (status) logger.error(JSON.stringify(status, null, 2));
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
      `[DownloadWorker] Processing completed download for ${row.title}`
    );
    await this.repo.markAsProcessing(row.id);
    try {
      if (!this.settings) {
        logger.error(`[DownloadWorker] Settings not found`);
        return;
      }
      const copyResult = await new FileManagementService().copyTrackedEpisodes(
        row,
        this.settings
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
            (x) => !episodes.includes(x.toString())
          ),
        ],
      });
      if (this.settings?.telegramId && this.settings?.botToken)
        new TelegramAdapter(this.settings).sendUpdate(row.title, copyResult);
    } catch (error) {
      logger.error(error);
      await this.repo.markAsCompleted(row.id);
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
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          missingFiles.push(file);
          logger.warn(`[DownloadWorker] File not found: ${file}`);
        } else {
          logger.error(
            `[DownloadWorker] Unexpected error while statting ${file}: ${String(
              err
            )}`
          );
          existingFiles.push(file);
        }
      }
    }

    if (missingFiles.length) {
      await this.repo.update(row.id, { files: existingFiles });
      logger.warn(
        `[DownloadWorker] Removed ${missingFiles.length} missing file(s) from DB for item ${row.title}`
      );
    }
  }

  // Entry point for a single polling iteration
  async process() {
    await this.getSetting();
    const rows = await this.repo.findAllDownloads();
    if (!rows) return;
    for (const row of rows) {
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
