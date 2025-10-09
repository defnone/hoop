import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import type { TorrentDataResult } from '@server/external/adapters/tracker-data';
import type { TorrentItemPort } from '@server/features/torrent-item/torrent-item.port';
import type {
  PagedResult,
  TorrentItemDto,
} from '@server/features/torrent-item/torrent-item.types';

// Mock logger to keep tests quiet and observable
vi.mock('@server/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock repo module to avoid loading bun:sqlite in Node test env
vi.mock('@server/workers/workers.repo', () => {
  return {
    WorkersRepo: class {
      public findSettings = vi.fn(async () => settings);
      public findAllIdle = vi.fn(async () => [
        { ...baseItem } satisfies DbTorrentItem,
      ]);
      public update = vi.fn(async () => undefined);
    },
  };
});

// Test doubles and fixtures
const baseItem: DbTorrentItem = {
  id: 1,
  trackerId: 't-1',
  rawTitle: 'Old Raw',
  title: 'Some Show',
  url: 'https://example.com/t?id=1',
  magnet: 'magnet:?xt=urn:btih:abcdef',
  season: 1,
  trackedEpisodes: [],
  haveEpisodes: [],
  totalEpisodes: 10,
  files: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  transmissionId: null,
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

// Capture latest created TorrentItem instance for assertions
let lastTI:
  | (TorrentItemPort & {
      addOrUpdateMock: ReturnType<typeof vi.fn>;
      markAsDownloadRequestedMock: ReturnType<typeof vi.fn>;
    })
  | null = null;
let nextTrackerData: TorrentDataResult | null = null;
let nextDatabaseData: DbTorrentItem | null = null;

// Mock implementation of TorrentItem service
vi.mock('@server/features/torrent-item/torrent-item.service', () => {
  class MockTI implements TorrentItemPort {
    public trackerData: TorrentDataResult | null = null;
    public databaseData: DbTorrentItem | null = null;
    public addOrUpdateMock = vi.fn();
    public markAsDownloadRequestedMock = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {
      lastTI = this as unknown as typeof lastTI extends infer T ? T : never;
    }

    async fetchData(): Promise<void> {
      // Use values arranged by the test
      this.trackerData = nextTrackerData;
      return Promise.resolve();
    }
    async getAll(
      page: number,
      limit: number
    ): Promise<PagedResult<TorrentItemDto>> {
      void limit;
      return Promise.resolve({
        items: [],
        total: 0,
        page,
        hasNext: false,
      });
    }
    async getById(): Promise<TorrentItemDto> {
      this.databaseData = nextDatabaseData;
      const dbItem = this.databaseData;
      return Promise.resolve({
        id: dbItem?.id ?? 0,
        trackerId: dbItem?.trackerId ?? '',
        tracker: dbItem?.tracker ?? '',
        title: dbItem?.title ?? '',
        rawTitle: dbItem?.rawTitle ?? '',
        url: dbItem?.url ?? '',
        files: Array.isArray(dbItem?.files) ? (dbItem?.files as string[]) : [],
        season: dbItem?.season ?? null,
        haveEpisodes: Array.isArray(dbItem?.haveEpisodes)
          ? (dbItem?.haveEpisodes as number[])
          : [],
        totalEpisodes: dbItem?.totalEpisodes ?? null,
        trackedEpisodes: Array.isArray(dbItem?.trackedEpisodes)
          ? (dbItem?.trackedEpisodes as number[])
          : [],
        magnet: dbItem?.magnet ?? null,
        controlStatus:
          (dbItem?.controlStatus as TorrentItemDto['controlStatus']) ?? 'idle',
        createdAt: dbItem?.createdAt ?? Date.now(),
        updatedAt: dbItem?.updatedAt ?? Date.now(),
      });
    }
    async addOrUpdate() {
      this.addOrUpdateMock();
      return Promise.resolve(null);
    }
    async markAsDownloadRequested() {
      this.markAsDownloadRequestedMock();
      return Promise.resolve();
    }
    async updateTrackedEpisodes(_episodes: number[]): Promise<void> {
      return Promise.resolve();
    }
    async setAllEpisodesTracked(): Promise<void> {
      return Promise.resolve();
    }
    async delete(_withFiles?: boolean): Promise<void> {
      return Promise.resolve();
    }
    async markAsPaused(): Promise<void> {
      return Promise.resolve();
    }
    async markAsIdle(): Promise<void> {
      return Promise.resolve();
    }
    async deleteFileEpisode(_filePath: string): Promise<void> {
      return Promise.resolve();
    }
  }

  return { TorrentItem: MockTI };
});

// Lightweight repo mock
class RepoMock {
  public findSettings = vi.fn(async () => settings);
  public findAllIdle = vi.fn(async () => [
    { ...baseItem } satisfies DbTorrentItem,
  ]);
  public update = vi.fn(async (_id: number, _data: unknown) => undefined);
}

describe('UpdateWorker.process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastTI = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates item and requests download when new data and tracked episodes are available', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    // Arrange: tracker returned a new rawTitle, DB has haveEpisodes intersecting with trackedEpisodes
    nextTrackerData = {
      torrentId: 't-1',
      rawTitle: 'New Raw',
      showTitle: 'Some Show',
      epAndSeason: { season: 1, startEp: 1, endEp: 12, totalEp: 12 },
      magnet: 'MAG',
    } satisfies TorrentDataResult;
    nextDatabaseData = {
      ...baseItem,
      rawTitle: 'Old Raw',
      trackedEpisodes: [2, 7],
      haveEpisodes: [7, 12],
    } satisfies DbTorrentItem;

    // Act
    await worker.process();

    // Assert: updated and requested download
    expect(lastTI?.addOrUpdateMock).toHaveBeenCalledTimes(1);
    expect(lastTI?.markAsDownloadRequestedMock).toHaveBeenCalledTimes(1);
    expect(repo.findAllIdle).toHaveBeenCalled();
    expect(repo.findSettings).toHaveBeenCalled();
  });

  it('does not update when tracker and DB titles match', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    nextTrackerData = {
      torrentId: 't-1',
      rawTitle: 'Same Raw',
      showTitle: 'Some Show',
      epAndSeason: null,
      magnet: 'MAG',
    } satisfies TorrentDataResult;
    nextDatabaseData = {
      ...baseItem,
      rawTitle: 'Same Raw',
      // Магнит совпадает с трекером, чтобы обновление не требовалось
      magnet: 'MAG',
      trackedEpisodes: [1],
      haveEpisodes: [1],
    } satisfies DbTorrentItem;

    await worker.process();

    expect(lastTI?.addOrUpdateMock).not.toHaveBeenCalled();
    expect(lastTI?.markAsDownloadRequestedMock).not.toHaveBeenCalled();
  });

  it('updates item without requesting download when no tracked episodes match', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    // New data from tracker but trackedEpisodes do not intersect with haveEpisodes
    nextTrackerData = {
      torrentId: 't-1',
      rawTitle: 'Brand New',
      showTitle: 'Some Show',
      epAndSeason: { season: 1, startEp: 1, endEp: 12, totalEp: 12 },
      magnet: 'MAG',
    } satisfies TorrentDataResult;
    nextDatabaseData = {
      ...baseItem,
      rawTitle: 'Old Raw',
      trackedEpisodes: [3, 4],
      haveEpisodes: [7, 8],
    } satisfies DbTorrentItem;

    await worker.process();

    expect(lastTI?.addOrUpdateMock).toHaveBeenCalledTimes(1);
    expect(lastTI?.markAsDownloadRequestedMock).not.toHaveBeenCalled();
  });

  it('updates item when only magnet changed', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    nextTrackerData = {
      torrentId: 't-1',
      rawTitle: 'Same Raw',
      showTitle: 'Some Show',
      epAndSeason: null,
      magnet: 'MAG-NEW',
    } satisfies TorrentDataResult;
    nextDatabaseData = {
      ...baseItem,
      rawTitle: 'Same Raw',
      magnet: 'MAG-OLD',
    } satisfies DbTorrentItem;

    await worker.process();

    expect(lastTI?.addOrUpdateMock).toHaveBeenCalledTimes(1);
    expect(lastTI?.markAsDownloadRequestedMock).not.toHaveBeenCalled();
  });

  it('skips item when tracker rawTitle is missing', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    nextTrackerData = null; // simulate missing tracker data
    nextDatabaseData = { ...baseItem } as DbTorrentItem;

    await worker.process();

    expect(lastTI?.addOrUpdateMock).not.toHaveBeenCalled();
    expect(lastTI?.markAsDownloadRequestedMock).not.toHaveBeenCalled();
  });
});

describe('UpdateWorker.run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs process on schedule and avoids duplicate intervals', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    const processSpy = vi.spyOn(worker, 'process').mockResolvedValue(undefined);

    const internals = worker as unknown as {
      syncInterval: number;
      lastSync: number;
      timerMs: number;
    };
    internals.syncInterval = 0;
    internals.lastSync = -1;
    internals.timerMs = 5;

    await worker.run();

    expect(processSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5);
    expect(processSpy).toHaveBeenCalledTimes(1);

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    await worker.run();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5);
    expect(processSpy).toHaveBeenCalledTimes(2);

    clearIntervalSpy.mockRestore();
  });
});
