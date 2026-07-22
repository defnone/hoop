import type { DbUserSettings } from '@server/db/app/app-schema';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import { SeriesDirectoryService } from '@server/features/file-management/series-directory.service';
import { SettingsService } from '@server/features/settings/settings.service';
import { SeriesDirectoryCleanupWorker } from '@server/workers/series-directory-cleanup-worker';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@server/db', () => ({ default: {} }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SeriesDirectoryCleanupWorker', () => {
  it('waits for the configured interval before cleanup', async () => {
    vi.useFakeTimers();
    const dependencies = createDependencies();
    const worker = new SeriesDirectoryCleanupWorker({
      ...dependencies,
      cleanupIntervalMs: 1000,
    });

    worker.run();
    expect(dependencies.settingsService.getSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(dependencies.settingsService.getSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(dependencies.settingsService.getSettings).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  it('skips cleanup when the setting is disabled', async () => {
    const dependencies = createDependencies({
      cleanEmptySeriesDirectories: false,
    });
    const worker = new SeriesDirectoryCleanupWorker(dependencies);

    await worker.cleanup();

    expect(
      dependencies.seriesDirectoryService.removeEmptyDirectories,
    ).not.toHaveBeenCalled();
  });

  it('records removed directories', async () => {
    const dependencies = createDependencies();
    vi.mocked(
      dependencies.seriesDirectoryService.removeEmptyDirectories,
    ).mockResolvedValue(['/media/Empty Show']);
    const worker = new SeriesDirectoryCleanupWorker(dependencies);

    await worker.cleanup();

    expect(
      dependencies.eventJournalService.recordSeriesDirectoryCleanupCompleted,
    ).toHaveBeenCalledWith({
      rootPath: '/media',
      removedPaths: ['/media/Empty Show'],
    });
  });

  it('prevents overlapping cleanup and records failures', async () => {
    const dependencies = createDependencies();
    let rejectCleanup: (error: Error) => void = () => undefined;
    vi.mocked(
      dependencies.seriesDirectoryService.removeEmptyDirectories,
    ).mockImplementation(
      () =>
        new Promise<string[]>((_resolve, reject) => {
          rejectCleanup = reject;
        }),
    );
    const worker = new SeriesDirectoryCleanupWorker(dependencies);

    const firstCleanup = worker.cleanup();
    await worker.cleanup();
    rejectCleanup(new Error('Permission denied'));
    await firstCleanup;

    expect(
      dependencies.seriesDirectoryService.removeEmptyDirectories,
    ).toHaveBeenCalledTimes(1);
    expect(
      dependencies.eventJournalService.recordSeriesDirectoryCleanupFailed,
    ).toHaveBeenCalledWith({ errorMessage: 'Permission denied' });
  });
});

function createDependencies(settingsOverride: Partial<DbUserSettings> = {}): {
  settingsService: SettingsService;
  seriesDirectoryService: SeriesDirectoryService;
  eventJournalService: EventJournalService;
} {
  const settings: DbUserSettings = {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: '/downloads',
    mediaDir: '/media',
    cleanEmptySeriesDirectories: true,
    deleteAfterDownload: false,
    syncInterval: 30,
    torrentClientType: 'transmission',
    torrentClientUrl: null,
    torrentClientUsername: null,
    torrentClientPassword: null,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null,
    kinozalPassword: null,
    flaresolverrEnabled: false,
    flaresolverrUrl: null,
    flaresolverrTimeoutSeconds: 60,
    ...settingsOverride,
  };

  const settingsService = new SettingsService();
  const seriesDirectoryService = new SeriesDirectoryService();
  const eventJournalService = new EventJournalService();
  vi.spyOn(settingsService, 'getSettings').mockResolvedValue(settings);
  vi.spyOn(seriesDirectoryService, 'removeEmptyDirectories').mockResolvedValue(
    [],
  );
  vi.spyOn(
    eventJournalService,
    'recordSeriesDirectoryCleanupCompleted',
  ).mockResolvedValue();
  vi.spyOn(
    eventJournalService,
    'recordSeriesDirectoryCleanupFailed',
  ).mockResolvedValue();

  return { settingsService, seriesDirectoryService, eventJournalService };
}
