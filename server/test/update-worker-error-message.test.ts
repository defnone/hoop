import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';

// Silence logs in tests
vi.mock('@server/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Avoid bun:sqlite import chain from WorkersRepo module
vi.mock('@server/workers/workers.repo', () => ({
  WorkersRepo: class {},
}));

// Mock TorrentItem service with controlled behavior per test file
let mode: 'throwFetch' | 'noTitle' | 'success' = 'success';

class MockTorrentItem {
  public trackerData: unknown = null;
  public databaseData: DbTorrentItem | null = null;
  constructor(_params: object) {
    void _params;
  }
  async getById(): Promise<void> {
    this.databaseData = { ...baseItem } satisfies DbTorrentItem;
  }
  async fetchData(): Promise<void> {
    if (mode === 'throwFetch') throw new Error('fetch boom');
    if (mode === 'noTitle') {
      this.trackerData = null;
      return;
    }
    this.trackerData = { rawTitle: baseItem.rawTitle, magnet: baseItem.magnet };
  }
  async addOrUpdate(): Promise<null> {
    return null;
  }
  async markAsDownloadRequested(): Promise<void> {
    return;
  }
  async getAll(): Promise<{ items: []; total: number; page: number; hasNext: boolean }> {
    return { items: [], total: 0, page: 1, hasNext: false };
  }
  async updateTrackedEpisodes(_episodes: number[]): Promise<void> {
    return;
  }
  async setAllEpisodesTracked(): Promise<void> {
    return;
  }
  async delete(_withFiles?: boolean): Promise<void> {
    return;
  }
  async markAsPaused(): Promise<void> {
    return;
  }
  async markAsIdle(): Promise<void> {
    return;
  }
  async deleteFileEpisode(_filePath: string): Promise<void> {
    return;
  }
}

vi.mock('@server/features/torrent-item/torrent-item.service', () => ({
  TorrentItem: MockTorrentItem,
}));

// Minimal Repo mock to capture updates
class RepoMock {
  public updates: Array<{ id: number; data: Partial<DbTorrentItem> }> = [];
  private readonly rows: DbTorrentItem[];
  private readonly settings: DbUserSettings;

  constructor(rows: DbTorrentItem[], settings: DbUserSettings) {
    this.rows = rows;
    this.settings = settings;
  }

  async findSettings(): Promise<DbUserSettings> {
    return this.settings;
  }

  async findAllIdle(): Promise<DbTorrentItem[]> {
    return this.rows;
  }

  async update(id: number, data: Partial<DbTorrentItem>): Promise<DbTorrentItem | undefined> {
    this.updates.push({ id, data });
    return undefined;
  }
}

const baseItem: DbTorrentItem = {
  id: 1,
  trackerId: 't-1',
  rawTitle: 'Raw',
  title: 'Show',
  url: 'https://example.com',
  magnet: 'magnet:?xt=urn:btih:HASH',
  season: 1,
  trackedEpisodes: [],
  haveEpisodes: [],
  totalEpisodes: 10,
  files: [],
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

describe('UpdateWorker errorMessage handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists errorMessage when fetch fails', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    mode = 'throwFetch';
    const repo = new RepoMock([{ ...baseItem }], settings);
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    await worker.process();

    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('Error on fetch data');
  });

  it('persists errorMessage when tracker title is missing', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    mode = 'noTitle';
    const repo = new RepoMock([{ ...baseItem }], settings);
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    await worker.process();

    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('no tracker title found');
  });

  it('clears UpdateWorker errorMessage on successful iteration', async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    mode = 'success';
    const repo = new RepoMock(
      [{ ...baseItem, errorMessage: 'UpdateWorker: prev' }],
      settings
    );
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    await worker.process();

    const clearUpdate = repo.updates.find((u) => Object.prototype.hasOwnProperty.call(u.data, 'errorMessage'));
    expect(clearUpdate).toBeDefined();
    expect(clearUpdate?.data.errorMessage).toBeNull();
  });

  it("doesn't clear DownloadWorker errorMessage on successful iteration", async () => {
    const { UpdateWorker } = await import('@server/workers/update-worker');
    mode = 'success';
    const repo = new RepoMock(
      [{ ...baseItem, errorMessage: 'DownloadWorker: prev' }],
      settings
    );
    const worker = new UpdateWorker({ repo: repo as unknown as never });

    await worker.process();

    const clearUpdate = repo.updates.find((u) =>
      Object.prototype.hasOwnProperty.call(u.data, 'errorMessage')
    );
    expect(clearUpdate).toBeUndefined();
  });
});
