import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import type { TorrentDataResult } from '@server/external/adapters/tracker-data';
import type { TorrentItemPort } from '@server/features/torrent-item/torrent-item.port';
import type { EventJournalPort } from '@server/features/event-journal/event-journal.port';
import type {
  PagedResult,
  TorrentItemDto,
} from '@server/features/torrent-item/torrent-item.types';

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn<(message: string) => Promise<void>>(),
}));

vi.mock('@server/external/adapters/telegram', () => ({
  TelegramAdapter: class {
    public sendMessage = sendMessageMock;
  },
}));

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
  },
}));

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
  jackettApiKey: null,
  jackettUrl: null,
  kinozalUsername: null,
  kinozalPassword: null,
  flaresolverrEnabled: false,
  flaresolverrUrl: null,
  flaresolverrTimeoutSeconds: 60,
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
let nextFetchError: Error | null = null;
let fetchDataDelayMs = 0;
let activeFetches = 0;
let maxActiveFetches = 0;
const originalUpdateBatchSize = process.env.HOOP_UPDATE_WORKER_BATCH_SIZE;

// Mock implementation of TorrentItem service
vi.mock('@server/features/torrent-item/torrent-item.service', () => {
  class MockTI implements TorrentItemPort {
    public trackerData: TorrentDataResult | null = null;
    public databaseData: DbTorrentItem | null = null;
    public addOrUpdateMock = vi.fn();
    public markAsDownloadRequestedMock = vi.fn();
    private readonly id: number;

    constructor({ id }: { id: number; url: string; trackerId: string }) {
      this.id = id;
      captureTorrentItem(this);
    }

    async fetchData(): Promise<void> {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);

      try {
        if (fetchDataDelayMs > 0) {
          await sleep(fetchDataDelayMs);
        }

        if (nextFetchError) {
          throw nextFetchError;
        }

        // Use values arranged by the test
        this.trackerData = nextTrackerData;
      } finally {
        activeFetches -= 1;
      }
    }
    async getAll(
      page: number,
      limit: number,
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
      this.databaseData = nextDatabaseData
        ? {
            ...nextDatabaseData,
            id: this.id,
          }
        : null;
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
        errorMessage: dbItem?.errorMessage ?? null,
        notifyOnTitleChange: dbItem?.notifyOnTitleChange ?? false,
        notifyOnMagnetChange: dbItem?.notifyOnMagnetChange ?? false,
        notifyOnDownloadComplete: dbItem?.notifyOnDownloadComplete ?? true,
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

function captureTorrentItem(
  item: TorrentItemPort & {
    addOrUpdateMock: ReturnType<typeof vi.fn>;
    markAsDownloadRequestedMock: ReturnType<typeof vi.fn>;
  },
): void {
  lastTI = item;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lightweight repo mock
class RepoMock {
  public findSettings = vi.fn(async () => settings);
  public findAllIdle = vi.fn(async () => [
    { ...baseItem } satisfies DbTorrentItem,
  ]);
  public update = vi.fn(async (_id: number, _data: unknown) => undefined);
}

class EventJournalMock implements EventJournalPort {
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

describe('UpdateWorker.process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMessageMock.mockResolvedValue(undefined);
    lastTI = null;
    nextFetchError = null;
    fetchDataDelayMs = 0;
    activeFetches = 0;
    maxActiveFetches = 0;
    delete process.env.HOOP_UPDATE_WORKER_BATCH_SIZE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalUpdateBatchSize) {
      process.env.HOOP_UPDATE_WORKER_BATCH_SIZE = originalUpdateBatchSize;
    } else {
      delete process.env.HOOP_UPDATE_WORKER_BATCH_SIZE;
    }
  });

  it('updates item and requests download when new data and tracked episodes are available', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new UpdateWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

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

  it('includes show and raw titles in title change notification', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    repo.findSettings.mockResolvedValue({
      ...settings,
      telegramId: 123456,
      botToken: 'bot-token',
    });
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    nextTrackerData = {
      torrentId: 't-1',
      rawTitle: 'Some Show S01E02 1080p',
      showTitle: 'Some Show',
      epAndSeason: { season: 1, startEp: 2, endEp: 2, totalEp: 12 },
      magnet: 'MAG',
    } satisfies TorrentDataResult;
    nextDatabaseData = {
      ...baseItem,
      notifyOnTitleChange: true,
    } satisfies DbTorrentItem;

    await worker.process();

    expect(sendMessageMock).toHaveBeenCalledWith(
      'New release for "Some Show": Some Show S01E02 1080p',
    );
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
    const eventJournal = new EventJournalMock();
    const worker = new UpdateWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

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
    expect(eventJournal.recordTorrentTitleChanged).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentTitleChanged).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: 1, title: 'Some Show' }),
      oldValue: 'Old Raw',
      newValue: 'Brand New',
    });
    expect(eventJournal.recordTorrentMagnetChanged).not.toHaveBeenCalled();
    expect(eventJournal.recordTorrentSyncFailed).not.toHaveBeenCalled();
  });

  it('updates item when only magnet changed', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new UpdateWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

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
    expect(eventJournal.recordTorrentMagnetChanged).toHaveBeenCalledTimes(1);
    expect(eventJournal.recordTorrentMagnetChanged).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: 1, title: 'Some Show' }),
      oldValue: 'MAG-OLD',
      newValue: 'MAG-NEW',
    });
    expect(eventJournal.recordTorrentTitleChanged).not.toHaveBeenCalled();
    expect(eventJournal.recordTorrentSyncFailed).not.toHaveBeenCalled();
  });

  it('records sync failed event when fetch data fails', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new UpdateWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    nextDatabaseData = { ...baseItem } satisfies DbTorrentItem;
    nextFetchError = new Error('tracker timeout');

    await worker.process();

    expect(eventJournal.recordTorrentSyncFailed).toHaveBeenCalledWith({
      torrentItem: expect.objectContaining({ id: 1, title: 'Some Show' }),
      errorMessage: 'UpdateWorker: Error on fetch data, tracker timeout',
    });
  });

  it('skips item when tracker rawTitle is missing', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const eventJournal = new EventJournalMock();
    const worker = new UpdateWorker({
      repo: repo as unknown as never,
      eventJournal,
    });

    nextTrackerData = null; // simulate missing tracker data
    nextDatabaseData = { ...baseItem } as DbTorrentItem;

    await worker.process();

    expect(lastTI?.addOrUpdateMock).not.toHaveBeenCalled();
    expect(lastTI?.markAsDownloadRequestedMock).not.toHaveBeenCalled();
    expect(eventJournal.recordTorrentSyncFailed).toHaveBeenCalledTimes(1);
  });

  it('processes idle items in env-sized batches', async () => {
    process.env.HOOP_UPDATE_WORKER_BATCH_SIZE = '3';

    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
    const rows: DbTorrentItem[] = Array.from({ length: 8 }, (_, index) => ({
      ...baseItem,
      id: index + 1,
      title: `Some Show ${index + 1}`,
    }));
    repo.findAllIdle.mockResolvedValue(rows);

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
      magnet: 'MAG',
    } satisfies DbTorrentItem;
    fetchDataDelayMs = 10;

    const worker = new UpdateWorker({ repo: repo as unknown as never });

    await worker.process();

    expect(maxActiveFetches).toBe(3);
  });

  it('does not start a manual sync while another sync is running', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    const repo = new RepoMock();
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
      magnet: 'MAG',
    } satisfies DbTorrentItem;
    fetchDataDelayMs = 10;

    const worker = new UpdateWorker({ repo: repo as unknown as never });

    expect(worker.startNow()).toBe(true);
    expect(worker.startNow()).toBe(false);

    await sleep(20);
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
