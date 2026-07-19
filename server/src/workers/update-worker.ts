import type { TorrentItemPort } from '@server/features/torrent-item/torrent-item.port';
import { WorkersRepo } from './workers.repo';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { formatErrorMessage } from '@server/lib/error-message';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import type { EventJournalPort } from '@server/features/event-journal/event-journal.port';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { TelegramAdapter } from '@server/external/adapters/telegram';

export class UpdateWorker {
  // Repository used to read settings and torrent items from DB
  private readonly repo: WorkersRepo;
  private readonly eventJournal: EventJournalPort;
  private readonly batchSize: number;
  // Tick for internal setInterval, ms
  private timerMs: number;
  // How often to run sync logic, ms (defaults to 60 min). Overridden by user settings.
  private syncInterval = 1000 * 60 * 60;
  // Timestamp of the most recent successful sync, ms
  private lastSync: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  // Prevent concurrent runs of process()
  private isProcessing = false;
  private settings: DbUserSettings | null = null;

  constructor({
    repo,
    eventJournal,
  }: {
    repo?: WorkersRepo;
    eventJournal?: EventJournalPort;
  }) {
    // Polling cadence: worker wakes up every timerMs and checks sync window
    this.timerMs = 10000;
    this.repo = repo || new WorkersRepo();
    this.eventJournal = eventJournal || new EventJournalService();
    this.batchSize = getUpdateBatchSize();
    // Allow overriding last sync time from env (useful for tests and ops)
    this.lastSync = process.env.HOOP_LAST_SYNC
      ? parseInt(process.env.HOOP_LAST_SYNC)
      : 0;
  }

  // Load current user settings and update sync interval
  private async getSetting() {
    const settings = await this.repo.findSettings();
    if (!settings) throw new Error('No settings found');
    this.settings = settings;
    // Convert minutes from settings into milliseconds for scheduling
    this.syncInterval = settings.syncInterval * 60 * 1000;
    return settings;
  }

  async process() {
    // Refresh settings and pick idle items to check for updates
    await this.getSetting();
    const allRows = await this.repo.findAllIdle();

    for (const batch of chunkRows(allRows, this.batchSize)) {
      const results = await Promise.allSettled(
        batch.map((row) => this.processRow(row)),
      );
      const rejectedResult = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (rejectedResult) {
        throw rejectedResult.reason;
      }
    }
    // Record this sync and log the next planned moment for observability
    this.lastSync = Date.now();
    process.env.HOOP_LAST_SYNC = this.lastSync.toString();
    logger.info(
      `[UpdateWorker] Next sync in ${new Date(
        this.lastSync + this.syncInterval,
      ).toLocaleString()}`,
    );
  }

  // Start the scheduler; ensures only one active interval exists
  async run() {
    logger.info('[UpdateWorker] Start');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.intervalId = setInterval(async () => {
      if (
        !this.isProcessing &&
        Date.now() > this.lastSync + this.syncInterval
      ) {
        try {
          await this.processWithLock();
        } catch (e) {
          logger.error(`[UpdateWorker] Error on process: ${e}`);
        }
      }
    }, this.timerMs);
  }

  startNow(): boolean {
    if (this.isProcessing) return false;

    this.isProcessing = true;
    void this.process()
      .catch((e) => {
        logger.error(`[UpdateWorker] Error on manual process: ${e}`);
      })
      .finally(() => {
        this.isProcessing = false;
      });

    return true;
  }

  isRunning(): boolean {
    return this.isProcessing;
  }

  private async processWithLock(): Promise<boolean> {
    if (this.isProcessing) return false;

    this.isProcessing = true;
    try {
      await this.process();
      return true;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processRow(row: DbTorrentItem): Promise<void> {
    logger.info(`[UpdateWorker] Starting sync ${row.title}`);
    // Build service instance for the DB row and refresh state
    const ti: TorrentItemPort = new TorrentItem({
      id: row.id,
      url: row.url,
      trackerId: row.trackerId,
    });
    // Pull latest data from tracker and the DB snapshot
    try {
      await Promise.all([ti.getById(), ti.fetchData()]);
    } catch (e) {
      const errorMessage =
        'UpdateWorker: Error on fetch data, ' + formatErrorMessage(e);
      logger.error(
        '[UpdateWorker] Error on fetch data, ' + formatErrorMessage(e),
      );
      await this.eventJournal.recordTorrentSyncFailed({
        torrentItem: row,
        errorMessage,
      });
      await this.repo.update(row.id, { errorMessage });
      return;
    }

    const trackerData = ti.trackerData;
    const databaseData = ti.databaseData;

    if (!trackerData?.rawTitle) {
      const errorMessage =
        'UpdateWorker: Error on fetch data, no tracker title found';
      logger.error(
        `[UpdateWorker] No tracker title found for ${databaseData?.title}.`,
      );
      await this.eventJournal.recordTorrentSyncFailed({
        torrentItem: databaseData ?? row,
        errorMessage,
      });
      await this.repo.update(row.id, { errorMessage });
      return;
    }

    if (!databaseData) {
      const errorMessage =
        'UpdateWorker: Error on fetch data, no database data found';
      await this.eventJournal.recordTorrentSyncFailed({
        torrentItem: row,
        errorMessage,
      });
      await this.repo.update(row.id, { errorMessage });
      return;
    }

    // If raw title differs — tracker has a new/updated payload
    if (trackerData.rawTitle !== databaseData.rawTitle) {
      logger.debug(
        `[UpdateWorker] Comparing: \n ${trackerData.rawTitle} \n ${databaseData.rawTitle}`,
      );
      await this.eventJournal.recordTorrentTitleChanged({
        torrentItem: databaseData,
        oldValue: databaseData.rawTitle,
        newValue: trackerData.rawTitle,
      });
      // Persist new tracker data
      await ti.addOrUpdate();
      if (databaseData.notifyOnTitleChange) {
        await this.sendNotification(
          `New release for "${trackerData.showTitle}": ${trackerData.rawTitle}`,
        );
      }
      if (
        trackerData.magnet !== databaseData.magnet &&
        databaseData.notifyOnMagnetChange
      ) {
        await this.sendNotification(
          `Magnet changed for "${trackerData.showTitle}"`,
        );
      }

      // If any tracked episode is present in the new torrent — request download
      const updatedDatabaseData = ti.databaseData ?? databaseData;
      const trackedEpisodes = toNumberArray(
        updatedDatabaseData.trackedEpisodes,
      );
      const haveEpisodes = toNumberArray(updatedDatabaseData.haveEpisodes);

      if (trackedEpisodes.length > 0) {
        for (const num of trackedEpisodes) {
          if (haveEpisodes.includes(num)) {
            await ti.markAsDownloadRequested();
            logger.info(
              `[UpdateWorker] Mark as download requested: ${updatedDatabaseData.title}`,
            );
            break;
          }
        }
      }
    } else if (trackerData.magnet !== databaseData.magnet) {
      logger.info(
        `[UpdateWorker] Magnet changed for ${databaseData.title}. Updating.`,
      );
      await this.eventJournal.recordTorrentMagnetChanged({
        torrentItem: databaseData,
        oldValue: databaseData.magnet,
        newValue: trackerData.magnet,
      });
      await ti.addOrUpdate();
      if (databaseData.notifyOnMagnetChange) {
        await this.sendNotification(
          `Magnet changed for "${databaseData.title}"`,
        );
      }
    } else {
      logger.info(`[UpdateWorker] No new data found for ${databaseData.title}`);
    }
    if (row.errorMessage) {
      const msg = String(row.errorMessage);
      const isUpdateWorkerError = msg.startsWith('UpdateWorker:');
      if (isUpdateWorkerError) {
        await this.repo.update(row.id, { errorMessage: null });
      }
    }
  }

  private async sendNotification(message: string): Promise<void> {
    if (!this.settings?.telegramId || !this.settings.botToken) return;
    try {
      await new TelegramAdapter(this.settings).sendMessage(message);
    } catch (error) {
      logger.error(
        `[UpdateWorker] Failed to send Telegram notification: ${formatErrorMessage(error)}`,
      );
    }
  }
}

const DEFAULT_UPDATE_BATCH_SIZE = 5;

function getUpdateBatchSize(): number {
  const rawValue = process.env.HOOP_UPDATE_WORKER_BATCH_SIZE;
  if (!rawValue) return DEFAULT_UPDATE_BATCH_SIZE;

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return DEFAULT_UPDATE_BATCH_SIZE;
  }

  return parsedValue;
}

function chunkRows(rows: DbTorrentItem[], size: number): DbTorrentItem[][] {
  const chunks: DbTorrentItem[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function toNumberArray(
  value: DbTorrentItem['trackedEpisodes'] | DbTorrentItem['haveEpisodes'],
): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number');
}
