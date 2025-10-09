import type { TorrentItemPort } from '@server/features/torrent-item/torrent-item.port';
import { WorkersRepo } from './workers.repo';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { formatErrorMessage } from '@server/lib/error-message';

export class UpdateWorker {
  // Torrent item service instance used during current iteration
  private ti: TorrentItemPort | undefined;
  // Repository used to read settings and torrent items from DB
  private readonly repo: WorkersRepo;
  // Tick for internal setInterval, ms
  private timerMs: number;
  // How often to run sync logic, ms (defaults to 60 min). Overridden by user settings.
  private syncInterval = 1000 * 60 * 60;
  // Timestamp of the most recent successful sync, ms
  private lastSync: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor({ repo }: { repo?: WorkersRepo }) {
    // Polling cadence: worker wakes up every timerMs and checks sync window
    this.timerMs = 10000;
    this.repo = repo || new WorkersRepo();
    // Allow overriding last sync time from env (useful for tests and ops)
    this.lastSync = process.env.HOOP_LAST_SYNC
      ? parseInt(process.env.HOOP_LAST_SYNC)
      : 0;
  }

  // Load current user settings and update sync interval
  private async getSetting() {
    const settings = await this.repo.findSettings();
    if (!settings) throw new Error('No settings found');
    // Convert minutes from settings into milliseconds for scheduling
    this.syncInterval = settings.syncInterval * 60 * 1000;
    return settings;
  }

  async process() {
    // Refresh settings and pick idle items to check for updates
    await this.getSetting();
    const allRows = await this.repo.findAllIdle();
    for (const row of allRows) {
      logger.info(`[UpdateWorker] Starting sync ${row.title}`);
      // Build service instance for the DB row and refresh state
      this.ti = new TorrentItem({
        id: row.id,
        url: row.url,
        trackerId: row.trackerId,
      });
      // Pull latest data from tracker and the DB snapshot
      try {
        await Promise.all([
          await this.ti?.getById(),
          await this.ti?.fetchData(),
        ]);
      } catch (e) {
        logger.error(`[UpdateWorker] Error on fetch: ${e}`);
        await this.repo.update(row.id, {
          errorMessage: 'Error on fetch data, ' + formatErrorMessage(e),
        });
        continue;
      }

      if (!this.ti?.trackerData?.rawTitle) {
        logger.error(
          `[UpdateWorker] No tracker title found for ${this.ti?.databaseData?.title}.`
        );
        this.repo.update(row.id, {
          errorMessage: 'Error on fetch data, no tracker title found',
        });
        continue;
      }

      // If raw title differs — tracker has a new/updated payload
      if (this.ti?.trackerData?.rawTitle !== this.ti?.databaseData?.rawTitle) {
        logger.debug(
          `[UpdateWorker] Comparing: \n ${this.ti?.trackerData?.rawTitle} \n ${this.ti?.databaseData?.rawTitle}`
        );
        // Persist new tracker data
        await this.ti?.addOrUpdate();

        // If any tracked episode is present in the new torrent — request download
        const trackedEpisodes = this.ti?.databaseData
          ?.trackedEpisodes as number[];
        const haveEpisodes = this.ti?.databaseData?.haveEpisodes as number[];

        if (trackedEpisodes && trackedEpisodes.length > 0) {
          for (const num of trackedEpisodes) {
            if (haveEpisodes && haveEpisodes.includes(num)) {
              await this.ti?.markAsDownloadRequested();
              logger.info(
                `[UpdateWorker] Mark as download requested: ${this.ti?.databaseData?.title}`
              );
              break;
            }
          }
        }
      } else if (this.ti.trackerData.magnet !== this.ti?.databaseData?.magnet) {
        logger.info(
          `[UpdateWorker] Magnet changed for ${this.ti?.databaseData?.title}. Updating.`
        );
        await this.ti?.addOrUpdate();
      } else {
        logger.info(
          `[UpdateWorker] No new data found for ${this.ti?.databaseData?.title}`
        );
      }
      if (row.errorMessage)
        await this.repo.update(row.id, { errorMessage: null });
    }
    // Record this sync and log the next planned moment for observability
    this.lastSync = Date.now();
    process.env.HOOP_LAST_SYNC = this.lastSync.toString();
    logger.info(
      `[UpdateWorker] Next sync in ${new Date(
        this.lastSync + this.syncInterval
      ).toLocaleString()}`
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
      if (Date.now() > this.lastSync + this.syncInterval) {
        try {
          await this.process();
        } catch (e) {
          logger.error(`[UpdateWorker] Error on process: ${e}`);
        }
      }
    }, this.timerMs);
  }
}
