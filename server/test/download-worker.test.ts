import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';

// Silence logs in tests
vi.mock('@server/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock repo module to avoid bun:sqlite import in tests
vi.mock('@server/workers/workers.repo', () => ({
  WorkersRepo: class {},
}));

vi.mock('@server/features/event-journal/event-journal.service', () => ({
  EventJournalService: class {
    async recordTorrentTitleChanged(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentMagnetChanged(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentSyncFailed(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentDownloadStarted(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentDownloadCompleted(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentDownloadFailed(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentFileCopyStarted(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentFileCopyCompleted(): Promise<void> {
      return Promise.resolve();
    }

    async recordTorrentFileCopyFailed(): Promise<void> {
      return Promise.resolve();
    }

    async recordTransmissionUnavailable(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

// Test fixtures
const item: DbTorrentItem = {
  id: 1,
  trackerId: 't1',
  rawTitle: 'raw',
  title: 'show',
  url: 'http://example',
  magnet: 'magnet:?xt=urn:btih:HASH',
  season: 1,
  trackedEpisodes: [],
  haveEpisodes: [],
  totalEpisodes: 5,
  files: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  torrentClientId: 'abc',
  torrentClientType: 'transmission',
  controlStatus: 'idle',
  tracker: 'kinozal',
  errorMessage: null,
  notifyOnTitleChange: false,
  notifyOnMagnetChange: false,
  notifyOnDownloadComplete: true,
};

const settings: DbUserSettings = {
  id: 1,
  telegramId: null,
  botToken: null,
  downloadDir: '/downloads',
  mediaDir: '/media',
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
};

// Mocks for collaborators
const add = vi.fn(async () => undefined);
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
const status = vi.fn(
  async (): Promise<
    Pick<NormalizedTorrent, 'isCompleted'> & { dateCompleted?: string }
  > => ({
    isCompleted: false,
  }),
);
const selectEpisodes = vi.fn(
  async (_downloadStatus: NormalizedTorrent) => undefined,
);
const remove = vi.fn(async () => undefined);
const sendUpdate = vi.fn(
  async (title: string, payload: Record<number, string>) => {
    void title;
    void payload;
    return Promise.resolve();
  },
);

vi.mock('@server/external/adapters/torrent-client', () => ({
  createTorrentClient: async () => ({
    async add() {
      return add();
    },
    async status() {
      return status();
    },
    async selectEpisodes(downloadStatus: NormalizedTorrent) {
      return selectEpisodes(downloadStatus);
    },
    async remove() {
      return remove();
    },
  }),
}));

vi.mock('@server/external/adapters/telegram/telegram.adapter', () => ({
  TelegramAdapter: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    sendUpdate(title: string, payload: Record<number, string>) {
      return sendUpdate(title, payload);
    }
  },
}));

const copyTrackedEpisodes = vi.fn(
  async (_ti: DbTorrentItem, _s: DbUserSettings) =>
    ({}) as Record<number, string>,
);
vi.mock('@server/features/file-management/file-management.service', () => ({
  FileManagementService: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    async copyTrackedEpisodes(ti: DbTorrentItem, s: DbUserSettings) {
      return copyTrackedEpisodes(ti, s);
    }
  },
}));

// Mock repo to drive worker behavior
class RepoMock {
  public findSettings = vi.fn(async () => settings);
  public findAllNeedToControl = vi.fn(
    async (): Promise<DbTorrentItem[] | null> => [],
  );
  public markAsCompleted = vi.fn(async (_id: number) => undefined);
  public markAsProcessing = vi.fn(async (_id: number) => undefined);
  public markAsIdle = vi.fn(async (_id: number) => undefined);
  public update = vi.fn(async (_id: number, _data: unknown) => undefined);
}

class EventJournalMock {
  public recordTorrentTitleChanged = vi.fn(async () => undefined);
  public recordTorrentMagnetChanged = vi.fn(async () => undefined);
  public recordTorrentSyncFailed = vi.fn(async () => undefined);
  public recordTorrentDownloadStarted = vi.fn(async () => undefined);
  public recordTorrentDownloadCompleted = vi.fn(async () => undefined);
  public recordTorrentDownloadFailed = vi.fn(async () => undefined);
  public recordTorrentFileCopyStarted = vi.fn(async () => undefined);
  public recordTorrentFileCopyCompleted = vi.fn(async () => undefined);
  public recordTorrentFileCopyFailed = vi.fn(async () => undefined);
  public recordTransmissionUnavailable = vi.fn(async () => undefined);
}

describe('DownloadWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('startDownload: calls add() and logs; handles errors gracefully', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    await worker.startDownload({ ...item });
    expect(add).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentDownloadStarted).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      message: 'Download started',
    });

    add.mockRejectedValueOnce(new Error('boom'));
    await worker.startDownload({ ...item });
    expect(add).toHaveBeenCalledTimes(2);
    expect(eventJournal.recordTorrentDownloadFailed).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      errorMessage: 'DownloadWorker: Failed to start downloading, boom',
    });
  });

  it('process: delays repeated download attempts and deduplicates journal failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));

    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });
    const requestedItem = {
      ...item,
      controlStatus: 'downloadRequested' as const,
    };
    repo.findAllNeedToControl.mockResolvedValue([requestedItem]);
    add.mockRejectedValue(new Error('Transmission unavailable'));

    await worker.process();
    await worker.process();

    expect(add).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentDownloadFailed).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await worker.process();

    expect(add).toHaveBeenCalledTimes(2);
    expect(eventJournal.recordTorrentDownloadFailed).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('processDownloading: marks completed when status is done', async () => {
    const { DownloadWorker, statusStorage } = await import(
      '@server/workers/download-worker'
    );
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    status.mockResolvedValueOnce({
      isCompleted: true,
      dateCompleted: new Date().toISOString(),
    });
    await worker.processDownloading({ ...item });

    expect(repo.markAsCompleted).toHaveBeenCalledWith(item.id);
    expect(eventJournal.recordTorrentDownloadCompleted).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      message: 'Download completed',
    });
    expect(statusStorage.get(item.id)).toBeUndefined();
  });

  it('processDownloading: selects episodes when not done', async () => {
    const { DownloadWorker, statusStorage } = await import(
      '@server/workers/download-worker'
    );
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockResolvedValueOnce({ isCompleted: false });
    await worker.processDownloading({ ...item });

    expect(selectEpisodes).toHaveBeenCalledTimes(1);
    expect(statusStorage.has(item.id)).toBe(true);
  });

  it('processDownloading: handles selectEpisodes errors and keeps status cached', async () => {
    const { DownloadWorker, statusStorage } = await import(
      '@server/workers/download-worker'
    );
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockResolvedValueOnce({ isCompleted: false });
    selectEpisodes.mockRejectedValueOnce(new Error('select failed'));

    await worker.processDownloading({ ...item });

    expect(repo.markAsCompleted).not.toHaveBeenCalled();
    expect(statusStorage.get(item.id)).toBeDefined();
  });

  it('processDownloading: marks idle when Transmission reports missing torrent', async () => {
    const { DownloadWorker, statusStorage } = await import(
      '@server/workers/download-worker'
    );
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockRejectedValueOnce(new Error('Torrent not found'));
    await worker.processDownloading({ ...item });

    expect(repo.markAsIdle).toHaveBeenCalledWith(item.id);
    expect(statusStorage.get(item.id)).toBeUndefined();
  });

  it('processDownloading: suppresses a temporary Transmission transport failure', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    status.mockRejectedValueOnce(
      new Error('Transmission request failed without an HTTP response'),
    );

    await worker.processDownloading({ ...item });

    expect(selectEpisodes).not.toHaveBeenCalled();
    expect(eventJournal.recordTorrentDownloadFailed).not.toHaveBeenCalled();
    expect(eventJournal.recordTransmissionUnavailable).not.toHaveBeenCalled();
  });

  it('processDownloading: reports one general alert after a three-minute Transmission outage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));

    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });
    const requestError = new Error(
      'Transmission request failed without an HTTP response',
    );

    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item });

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item, id: 2 });

    expect(eventJournal.recordTransmissionUnavailable).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 1000);
    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item });

    expect(eventJournal.recordTransmissionUnavailable).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTransmissionUnavailable).toHaveBeenCalledWith({
      errorMessage:
        'DownloadWorker: Failed to check download status, Transmission request failed without an HTTP response',
    });

    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item, id: 2 });

    expect(eventJournal.recordTransmissionUnavailable).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentDownloadFailed).not.toHaveBeenCalled();
  });

  it('processDownloading: resets Transmission outage window after a successful response', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));

    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });
    const requestError = new Error(
      'Transmission request failed without an HTTP response',
    );

    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item });

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    status.mockResolvedValueOnce({ isCompleted: false });
    await worker.processDownloading({ ...item });

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    status.mockRejectedValueOnce(requestError);
    await worker.processDownloading({ ...item });

    expect(eventJournal.recordTransmissionUnavailable).not.toHaveBeenCalled();
  });

  it('processCompletedDownload: copies files and removes from Transmission', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    // Ensure settings is loaded by invoking process() prelude
    repo.findAllNeedToControl.mockResolvedValueOnce([]);
    // Enable deletion after download to match removal expectation
    repo.findSettings.mockResolvedValueOnce({
      ...settings,
      deleteAfterDownload: true,
    });
    await worker.process();

    copyTrackedEpisodes.mockResolvedValueOnce({
      1: '/media/show/S01E01.mkv',
      2: '/media/show/S01E02.mkv',
    });
    await worker.processCompletedDownload({ ...item });
    expect(repo.markAsProcessing).toHaveBeenCalledWith(item.id);
    expect(eventJournal.recordTorrentFileCopyStarted).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      message: 'File copy started',
    });
    expect(copyTrackedEpisodes).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentFileCopyCompleted).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      message:
        'Copied 2 file(s)\n/media/show/S01E01.mkv\n/media/show/S01E02.mkv',
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('processCompletedDownload: exits early when settings are missing', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    // Do not call process() so settings remain undefined
    await worker.processCompletedDownload({ ...item });
    expect(repo.markAsProcessing).toHaveBeenCalledWith(item.id);
    expect(copyTrackedEpisodes).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('processCompletedDownload: exits early on copy error', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new DownloadWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    // Prepare settings
    repo.findAllNeedToControl.mockResolvedValueOnce([]);
    await worker.process();

    copyTrackedEpisodes.mockRejectedValueOnce(new Error('copy failed'));
    await worker.processCompletedDownload({ ...item });

    expect(remove).not.toHaveBeenCalled();
    expect(eventJournal.recordTorrentFileCopyFailed).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: item.id }),
      errorMessage:
        'DownloadWorker: Error processing completed download, copy failed',
    });
  });

  it('process: dispatches by controlStatus for each row', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    const req = { ...item, controlStatus: 'downloadRequested' as const };
    const dl = { ...item, id: 2, controlStatus: 'downloading' as const };
    const done = {
      ...item,
      id: 3,
      controlStatus: 'downloadCompleted' as const,
    };

    // Ensure deletion after download to assert remove()
    repo.findSettings.mockResolvedValueOnce({
      ...settings,
      deleteAfterDownload: true,
    });
    repo.findAllNeedToControl.mockResolvedValueOnce([req, dl, done]);

    await worker.process();

    // add() once for requested
    expect(add).toHaveBeenCalledTimes(1);
    // selectEpisodes() once for downloading
    expect(selectEpisodes).toHaveBeenCalledTimes(1);
    // remove() once for completed (after copy)
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('process: cleans up missing files for idle items after sync', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    const existingFile = '/tmp/existing.mkv';
    const dirPath = '/tmp/directory';
    const missingFile = '/tmp/missing.mkv';
    const errorFile = '/tmp/error.mkv';

    repo.findAllNeedToControl.mockResolvedValueOnce([
      {
        ...item,
        controlStatus: 'idle',
        files: [existingFile, dirPath, missingFile, errorFile],
      },
    ]);

    const previousSync = process.env.HOOP_LAST_SYNC;
    process.env.HOOP_LAST_SYNC = Date.now().toString();

    const statSpy = vi.spyOn(fs, 'stat');
    statSpy.mockImplementationOnce(
      async () => ({ isFile: () => true }) as never,
    );
    statSpy.mockImplementationOnce(
      async () => ({ isFile: () => false }) as never,
    );
    statSpy.mockImplementationOnce(async () => {
      const err = new Error('missing') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    statSpy.mockImplementationOnce(async () => {
      const err = new Error('unexpected') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    await worker.process();

    expect(statSpy).toHaveBeenCalledTimes(4);
    expect(repo.update).toHaveBeenCalledWith(item.id, {
      files: [existingFile, errorFile],
    });

    if (previousSync === undefined) {
      delete process.env.HOOP_LAST_SYNC;
    } else {
      process.env.HOOP_LAST_SYNC = previousSync;
    }
  });

  it('processCompletedDownload: sends Telegram updates when credentials present', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    const telegramSettings: DbUserSettings = {
      ...settings,
      telegramId: 123,
      botToken: 'token',
    };

    repo.findAllNeedToControl.mockResolvedValueOnce([]);
    repo.findSettings.mockResolvedValueOnce(telegramSettings);

    const copyResult: Record<number, string> = { 1: '/media/file1.mkv' };
    copyTrackedEpisodes.mockResolvedValueOnce(copyResult);

    await worker.process();

    await worker.processCompletedDownload({
      ...item,
      trackedEpisodes: [],
      files: [],
    });

    expect(sendUpdate).toHaveBeenCalledWith(item.title, copyResult);
  });

  it('processCompletedDownload: skips disabled Telegram updates', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });
    const telegramSettings: DbUserSettings = {
      ...settings,
      telegramId: 123,
      botToken: 'token',
    };

    repo.findAllNeedToControl.mockResolvedValueOnce([]);
    repo.findSettings.mockResolvedValueOnce(telegramSettings);
    await worker.process();
    sendUpdate.mockClear();

    await worker.processCompletedDownload({
      ...item,
      notifyOnDownloadComplete: false,
      trackedEpisodes: [],
      files: [],
    });

    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('processCompletedDownload: handles Telegram failures', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });
    const telegramSettings: DbUserSettings = {
      ...settings,
      telegramId: 123,
      botToken: 'token',
    };

    repo.findAllNeedToControl.mockResolvedValueOnce([]);
    repo.findSettings.mockResolvedValueOnce(telegramSettings);
    await worker.process();
    sendUpdate.mockRejectedValueOnce(new Error('Telegram unavailable'));

    await expect(
      worker.processCompletedDownload({
        ...item,
        trackedEpisodes: [],
        files: [],
      }),
    ).resolves.toBeUndefined();

    expect(repo.markAsIdle).not.toHaveBeenCalled();
  });

  it('run: schedules processing and clears previous interval', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    vi.useFakeTimers();

    const processSpy = vi.spyOn(worker, 'process').mockResolvedValue(undefined);

    await worker.run();
    await vi.advanceTimersByTimeAsync(5000);
    expect(processSpy).toHaveBeenCalledTimes(1);

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    await worker.run();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(processSpy).toHaveBeenCalledTimes(2);

    clearIntervalSpy.mockRestore();
    vi.useRealTimers();
  });
});
