import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import { SeriesDirectoryService } from '@server/features/file-management/series-directory.service';
import { SettingsService } from '@server/features/settings/settings.service';
import logger from '@server/lib/logger';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

type SeriesDirectoryCleanupWorkerParams = {
  settingsService?: SettingsService;
  seriesDirectoryService?: SeriesDirectoryService;
  eventJournalService?: EventJournalService;
  cleanupIntervalMs?: number;
};

export class SeriesDirectoryCleanupWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly settingsService: SettingsService;
  private readonly seriesDirectoryService: SeriesDirectoryService;
  private readonly eventJournalService: EventJournalService;
  private readonly cleanupIntervalMs: number;

  constructor({
    settingsService = new SettingsService(),
    seriesDirectoryService = new SeriesDirectoryService(),
    eventJournalService = new EventJournalService(),
    cleanupIntervalMs = CLEANUP_INTERVAL_MS,
  }: SeriesDirectoryCleanupWorkerParams = {}) {
    this.settingsService = settingsService;
    this.seriesDirectoryService = seriesDirectoryService;
    this.eventJournalService = eventJournalService;
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  run(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.cleanup(), this.cleanupIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async cleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const settings = await this.settingsService.getSettings();
      if (!settings?.cleanEmptySeriesDirectories || !settings.mediaDir) return;

      const removedPaths =
        await this.seriesDirectoryService.removeEmptyDirectories(
          settings.mediaDir,
        );
      if (removedPaths.length === 0) return;

      await this.eventJournalService.recordSeriesDirectoryCleanupCompleted({
        rootPath: settings.mediaDir,
        removedPaths,
      });
      logger.info(`Removed ${removedPaths.length} empty series directories`);
    } catch (error: unknown) {
      const message: string =
        error instanceof Error ? error.message : String(error);
      logger.error(`Series directory cleanup failed: ${message}`);
      await this.eventJournalService
        .recordSeriesDirectoryCleanupFailed({ errorMessage: message })
        .catch((journalError: unknown) => {
          logger.error(
            `Failed to record series directory cleanup error: ${String(journalError)}`,
          );
        });
    } finally {
      this.running = false;
    }
  }
}
