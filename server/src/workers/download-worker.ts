import { WorkersRepo } from './workers.repo';
import logger from '@server/lib/logger';
import { createTorrentClient } from '@server/external/adapters/torrent-client';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import { promises as fs } from 'fs';
import { FileManagementService } from '@server/features/file-management/file-management.service';
import { TelegramAdapter } from '@server/external/adapters/telegram/telegram.adapter';
import { formatErrorMessage } from '@server/lib/error-message';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import type { EventJournalPort } from '@server/features/event-journal/event-journal.port';
import type { DbTorrentCopyFailure } from '@server/db/app/app-schema';
import type { EpisodeCopyFailure } from '@server/features/file-management/file-management.service';

const DOWNLOAD_START_RETRY_DELAY_MS = 5 * 60 * 1000;
const TRANSMISSION_UNAVAILABLE_WINDOW_MS = 3 * 60 * 1000;
const COPY_FAILURE_NOTIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const COPY_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

type DownloadStartRetry = {
  errorMessage: string;
  nextAttemptAt: number;
};

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
  private readonly downloadStartRetries = new Map<number, DownloadStartRetry>();
  private transmissionUnavailableSince: number | null = null;
  private transmissionOutageReported = false;

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
  async startDownload(row: DbTorrentItem): Promise<boolean> {
    const retry = this.downloadStartRetries.get(row.id);
    if (retry && retry.nextAttemptAt > Date.now()) return false;

    logger.info(`[DownloadWorker] Start downloading ${row.title}`);
    try {
      const client = await createTorrentClient({
        id: row.id,
        torrentItem: row,
      });
      await client.add();
      await this.eventJournal.recordTorrentDownloadStarted({
        torrentItem: row,
        message: 'Download started',
      });
      this.downloadStartRetries.delete(row.id);
      return true;
    } catch (e) {
      logger.error(`[DownloadWorker] Failed to start downloading ${row.title}`);
      logger.error(e);
      this.error =
        'DownloadWorker: Failed to start downloading, ' + formatErrorMessage(e);
      const previousRetry = this.downloadStartRetries.get(row.id);
      this.downloadStartRetries.set(row.id, {
        errorMessage: this.error,
        nextAttemptAt: Date.now() + DOWNLOAD_START_RETRY_DELAY_MS,
      });

      if (previousRetry?.errorMessage !== this.error) {
        await this.eventJournal.recordTorrentDownloadFailed({
          torrentItem: row,
          errorMessage: this.error,
        });
      }

      return true;
    }
  }

  // Poll Transmission for current status and act accordingly
  async processDownloading(row: DbTorrentItem) {
    let status: NormalizedTorrent | undefined;
    let client: Awaited<ReturnType<typeof createTorrentClient>>;
    try {
      client = await createTorrentClient({
        id: row.id,
        torrentItem: row,
      });
      status = await client.status();
      this.resetTransmissionAvailability();
      if (status) statusStorage.set(row.id, status);
    } catch (e) {
      logger.error(
        `[DownloadWorker] Failed to check download status ${row.title}: ${e}`,
      );
      if (e instanceof Error && e.message.includes('Torrent not found')) {
        this.resetTransmissionAvailability();
        logger.error(
          `[DownloadWorker] Torrent ${row.title} not found, looks like it was removed from Transmission. Mark as idle.`,
        );
        await this.repo.markAsIdle(row.id);
        statusStorage.delete(row.id);
        this.error =
          'DownloadWorker: Failed to check download status, ' +
          formatErrorMessage(e);
        await this.eventJournal.recordTorrentDownloadFailed({
          torrentItem: row,
          errorMessage: this.error,
        });
        return;
      }
      const errorMessage =
        'DownloadWorker: Failed to check download status, ' +
        formatErrorMessage(e);
      if (isTransmissionUnavailableError(e)) {
        await this.recordTransmissionUnavailable(errorMessage);
        return;
      }
      this.resetTransmissionAvailability();
      this.error = errorMessage;
      await this.eventJournal.recordTorrentDownloadFailed({
        torrentItem: row,
        errorMessage,
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
        return;
      }
    }
  }

  private async recordTransmissionUnavailable(
    errorMessage: string,
  ): Promise<void> {
    if (this.transmissionUnavailableSince === null) {
      this.transmissionUnavailableSince = Date.now();
      return;
    }
    if (this.transmissionOutageReported) return;
    if (
      Date.now() - this.transmissionUnavailableSince <
      TRANSMISSION_UNAVAILABLE_WINDOW_MS
    ) {
      return;
    }

    await this.eventJournal.recordTransmissionUnavailable({
      errorMessage,
    });
    this.transmissionOutageReported = true;
  }

  private resetTransmissionAvailability(): void {
    this.transmissionUnavailableSince = null;
    this.transmissionOutageReported = false;
  }

  // After download finishes, copy files to the media library and remove from Transmission
  async processCompletedDownload(row: DbTorrentItem) {
    let client: Awaited<ReturnType<typeof createTorrentClient>>;
    const previousFailure = await this.repo.findCopyFailure(row.id);
    if (previousFailure && previousFailure.nextAttemptAt > Date.now()) return;

    logger.info(
      `[DownloadWorker] Processing completed download for ${row.title}`,
    );
    await this.repo.markAsProcessing(row.id);
    try {
      client = await createTorrentClient({
        id: row.id,
        torrentItem: row,
      });
      if (!this.settings) {
        throw new Error('Settings not found');
      }
      await this.eventJournal.recordTorrentFileCopyStarted({
        torrentItem: row,
        message: 'File copy started',
      });
      const copyResult = await new FileManagementService().copyTrackedEpisodes(
        row,
        this.settings,
      );
      const failedEpisodeNumbers = new Set(
        copyResult.failures.map(({ episodeNumber }) => episodeNumber),
      );
      const completedEpisodes = Object.keys(copyResult.files).filter(
        (episodeNumber) => !failedEpisodeNumbers.has(Number(episodeNumber)),
      );
      const files = Object.values(copyResult.files);
      const existingFiles = Array.isArray(row.files)
        ? (row.files as string[])
        : [];
      const newFiles = files.filter((x) => !existingFiles.includes(x));
      await this.repo.update(row.id, {
        files: [...newFiles, ...existingFiles],
        trackedEpisodes: [
          ...(row?.trackedEpisodes as number[]).filter(
            (episodeNumber) =>
              !completedEpisodes.includes(episodeNumber.toString()),
          ),
        ],
      });

      if (copyResult.failures.length > 0) {
        await this.holdTorrentAfterCopyFailure(
          row,
          copyResult.failures,
          previousFailure,
        );
        return;
      }

      await this.eventJournal.recordTorrentFileCopyCompleted({
        torrentItem: row,
        message: formatCopiedFilesMessage(newFiles),
      });
      if (
        row.notifyOnDownloadComplete &&
        !previousFailure &&
        this.settings?.telegramId &&
        this.settings?.botToken
      ) {
        try {
          await new TelegramAdapter(this.settings).sendUpdate(
            row.title,
            copyResult.files,
          );
        } catch (error) {
          logger.error(
            `[DownloadWorker] Failed to send Telegram notification: ${formatErrorMessage(error)}`,
          );
        }
      }

      if (previousFailure) {
        await this.sendCopyRecoveryNotification(row, previousFailure);
        await this.repo.deleteCopyFailure(row.id);
      }
    } catch (e) {
      logger.error(e);
      this.error =
        'DownloadWorker: Error processing completed download, ' +
        formatErrorMessage(e);
      const trackedEpisodes = Array.isArray(row.trackedEpisodes)
        ? (row.trackedEpisodes as number[])
        : [];
      const failures = (trackedEpisodes.length ? trackedEpisodes : [0]).map(
        (episodeNumber) => ({
          episodeNumber,
          message: formatErrorMessage(e),
        }),
      );
      try {
        await this.holdTorrentAfterCopyFailure(
          row,
          failures,
          previousFailure,
        );
      } catch (holdError) {
        logger.error(
          `[DownloadWorker] Failed to persist copy retry: ${formatErrorMessage(holdError)}`,
        );
        await this.repo.markAsCompleted(row.id);
      }
      return;
    }
    if (this.settings?.deleteAfterDownload) {
      await client.remove(true);
      logger.info(`[DownloadWorker] Torrent removed from client`);
    }
  }

  private async holdTorrentAfterCopyFailure(
    row: DbTorrentItem,
    failures: EpisodeCopyFailure[],
    previousFailure: DbTorrentCopyFailure | undefined,
  ): Promise<void> {
    const fingerprint = createCopyFailureFingerprint(failures);
    const isSameFailure = previousFailure?.fingerprint === fingerprint;
    const attemptCount = isSameFailure
      ? previousFailure.attemptCount + 1
      : 1;
    const now = Date.now();
    const shouldReport =
      !isSameFailure ||
      !previousFailure?.notifiedAt ||
      now - previousFailure.notifiedAt >= COPY_FAILURE_NOTIFICATION_WINDOW_MS;
    const retryDelay = getCopyRetryDelay(attemptCount);
    const notification = formatCopyFailureNotification(
      row,
      failures,
      retryDelay,
    );

    await this.repo.markAsCompleted(row.id);
    await this.repo.saveCopyFailure({
      torrentItemId: row.id,
      attemptCount,
      nextAttemptAt: now + retryDelay,
      fingerprint,
      notifiedAt: shouldReport ? now : previousFailure?.notifiedAt ?? null,
    });

    this.error = `DownloadWorker: Error processing completed download, ${formatCopyFailureSummary(failures)}`;
    if (!shouldReport) return;

    await this.eventJournal.recordTorrentFileCopyFailed({
      torrentItem: row,
      errorMessage: this.error,
    });
    await this.sendTelegramMessage(notification);
  }

  private async sendCopyRecoveryNotification(
    row: DbTorrentItem,
    previousFailure: DbTorrentCopyFailure,
  ): Promise<void> {
    if (!previousFailure.notifiedAt) return;
    await this.sendTelegramMessage(
      `File copy recovered\n\n${row.title}\nAll tracked episodes copied successfully. Torrent cleanup can continue.`,
    );
  }

  private async sendTelegramMessage(message: string): Promise<void> {
    if (!this.settings?.telegramId || !this.settings.botToken) return;
    try {
      await new TelegramAdapter(this.settings).sendMessage(message);
    } catch (error) {
      logger.error(
        `[DownloadWorker] Failed to send Telegram notification: ${formatErrorMessage(error)}`,
      );
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
          case 'downloadRequested': {
            const attempted = await this.startDownload(row);
            if (!attempted) continue;
            break;
          }
          case 'downloading':
            this.downloadStartRetries.delete(row.id);
            await this.processDownloading(row);
            break;
          case 'downloadCompleted':
            this.downloadStartRetries.delete(row.id);
            await this.processCompletedDownload(row);
            break;
          case 'idle':
          case 'paused':
            this.downloadStartRetries.delete(row.id);
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

function isTransmissionUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      'Transmission request failed without an HTTP response',
    )
  );
}

function createCopyFailureFingerprint(failures: EpisodeCopyFailure[]): string {
  return failures
    .map(({ episodeNumber, message }) => `${episodeNumber}:${message}`)
    .sort()
    .join('|');
}

function getCopyRetryDelay(attemptCount: number): number {
  if (attemptCount <= 1) return COPY_RETRY_DELAYS_MS[0];
  if (attemptCount === 2) return COPY_RETRY_DELAYS_MS[1];
  if (attemptCount === 3) return COPY_RETRY_DELAYS_MS[2];
  return COPY_RETRY_DELAYS_MS[3];
}

function formatCopyFailureSummary(failures: EpisodeCopyFailure[]): string {
  return failures
    .map(({ episodeNumber, message }) =>
      episodeNumber > 0 ? `episode ${episodeNumber}: ${message}` : message,
    )
    .join('; ');
}

function formatCopyFailureNotification(
  row: DbTorrentItem,
  failures: EpisodeCopyFailure[],
  retryDelay: number,
): string {
  const episodes = failures
    .filter(({ episodeNumber }) => episodeNumber > 0)
    .map(({ episodeNumber }) => episodeNumber)
    .join(', ');
  const reasons = [...new Set(failures.map(({ message }) => message))]
    .slice(0, 3)
    .join('\n');
  const retryMinutes = Math.round(retryDelay / 60_000);
  return [
    'File copy failed',
    '',
    `${row.title} — Season ${row.season ?? 0}`,
    `Episodes: ${episodes || 'unknown'}`,
    `Reason: ${reasons}`,
    '',
    `Torrent retained. Next retry in ${retryMinutes} minutes.`,
  ].join('\n');
}
