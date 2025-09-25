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
  transmissionId: 'abc',
  controlStatus: 'idle',
  tracker: 'kinozal',
  errorMessage: null,
};

const settings: DbUserSettings = {
  id: 1,
  telegramId: null,
  botToken: null,
  downloadDir: '/downloads',
  mediaDir: '/media',
  deleteAfterDownload: false,
  syncInterval: 30,
  jackettApiKey: null,
  jackettUrl: null,
  kinozalUsername: null,
  kinozalPassword: null,
};

// Mocks for collaborators
const add = vi.fn(async () => undefined);
const status = vi.fn(async () => ({ isCompleted: false }));
const selectEpisodes = vi.fn(async () => undefined);
const remove = vi.fn(async () => undefined);
const sendUpdate = vi.fn(() => undefined);

vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    async add() { return add(); }
    async status() { return status(); }
    async selectEpisodes() { return selectEpisodes(); }
    async remove() { return remove(); }
  },
}));

vi.mock('@server/external/adapters/telegram/telegram.adapter', () => ({
  TelegramAdapter: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    sendUpdate(...args: Parameters<typeof sendUpdate>) {
      return sendUpdate(...args);
    }
  },
}));

const copyTrackedEpisodes = vi.fn(async () => ({} as Record<number, string>));
vi.mock('@server/features/file-management/file-management.service', () => ({
  FileManagementService: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    async copyTrackedEpisodes(...args: unknown[]) {
      return copyTrackedEpisodes(...(args as [unknown, unknown]));
    }
  },
}));

// Mock repo to drive worker behavior
class RepoMock {
  public findSettings = vi.fn(async () => settings);
  public findAllDownloads = vi.fn(async (): Promise<DbTorrentItem[]> => []);
  public markAsCompleted = vi.fn(async (_id: number) => undefined);
  public markAsProcessing = vi.fn(async (_id: number) => undefined);
  public markAsIdle = vi.fn(async (_id: number) => undefined);
  public update = vi.fn(async (_id: number, _data: unknown) => undefined);
}

describe('DownloadWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('startDownload: calls add() and logs; handles errors gracefully', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    await worker.startDownload({ ...item });
    expect(add).toHaveBeenCalledTimes(1);

    add.mockRejectedValueOnce(new Error('boom'));
    await worker.startDownload({ ...item });
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('processDownloading: marks completed when status is done', async () => {
    const { DownloadWorker, statusStorage } = await import(
      '@server/workers/download-worker'
    );
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockResolvedValueOnce({
      isCompleted: true,
      dateCompleted: new Date().toISOString(),
    });
    await worker.processDownloading({ ...item });

    expect(repo.markAsCompleted).toHaveBeenCalledWith(item.id);
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

  it('processCompletedDownload: copies files and removes from Transmission', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    // Ensure settings is loaded by invoking process() prelude
    repo.findAllDownloads.mockResolvedValueOnce([]);
    // Enable deletion after download to match removal expectation
    repo.findSettings.mockResolvedValueOnce({ ...settings, deleteAfterDownload: true });
    await worker.process();

    await worker.processCompletedDownload({ ...item });
    expect(repo.markAsProcessing).toHaveBeenCalledWith(item.id);
    expect(copyTrackedEpisodes).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('processCompletedDownload: exits early when settings are missing', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    // Do not call process() so settings remain undefined
    await worker.processCompletedDownload({ ...item });
    expect(repo.markAsProcessing).toHaveBeenCalledWith(item.id);
    expect(copyTrackedEpisodes).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('processCompletedDownload: exits early on copy error', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    // Prepare settings
    repo.findAllDownloads.mockResolvedValueOnce([]);
    await worker.process();

    copyTrackedEpisodes.mockRejectedValueOnce(new Error('copy failed'));
    await worker.processCompletedDownload({ ...item });

    expect(remove).not.toHaveBeenCalled();
  });

  it('process: dispatches by controlStatus for each row', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    const req = { ...item, controlStatus: 'donwloadRequested' as const };
    const dl = { ...item, id: 2, controlStatus: 'downloading' as const };
    const done = { ...item, id: 3, controlStatus: 'downloadCompleted' as const };

    // Ensure deletion after download to assert remove()
    repo.findSettings.mockResolvedValueOnce({ ...settings, deleteAfterDownload: true });
    repo.findAllDownloads.mockResolvedValueOnce([req, dl, done]);

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

    repo.findAllDownloads.mockResolvedValueOnce([
      {
        ...item,
        controlStatus: 'idle',
        files: [existingFile, dirPath, missingFile, errorFile],
      },
    ]);

    const previousSync = process.env.HOOP_LAST_SYNC;
    process.env.HOOP_LAST_SYNC = Date.now().toString();

    const statSpy = vi.spyOn(fs, 'stat');
    statSpy.mockImplementationOnce(async () => ({ isFile: () => true } as never));
    statSpy.mockImplementationOnce(async () => ({ isFile: () => false } as never));
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
      telegramId: '123',
      botToken: 'token',
    };

    repo.findAllDownloads.mockResolvedValueOnce([]);
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

  it('run: schedules processing and clears previous interval', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock();
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    vi.useFakeTimers();

    const processSpy = vi
      .spyOn(worker, 'process')
      .mockResolvedValue(undefined);

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
