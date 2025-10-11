import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { promises as fs } from 'fs';

// Silence logs in tests
vi.mock('@server/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Avoid bun:sqlite import chain from WorkersRepo module
vi.mock('@server/workers/workers.repo', () => ({
  WorkersRepo: class {},
}));

// Transmission adapter mock with configurable behavior per test
const add = vi.fn(async () => undefined);
const status = vi.fn(async () => ({ isCompleted: false } as { isCompleted: boolean }));
const selectEpisodes = vi.fn(async () => undefined);
const remove = vi.fn(async () => undefined);

vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: class {
    constructor(_params: object) {
      void _params;
    }
    async add() {
      return add();
    }
    async status() {
      return status();
    }
    async selectEpisodes() {
      return selectEpisodes();
    }
    async remove() {
      return remove();
    }
  },
}));

// Minimal Repo mock to capture updates and calls
class RepoMock {
  public updates: Array<{ id: number; data: Partial<DbTorrentItem> }> = [];
  public processed: number[] = [];
  public idled: number[] = [];
  public completed: number[] = [];
  private readonly rows: DbTorrentItem[];
  private readonly settings: DbUserSettings;

  constructor(rows: DbTorrentItem[], settings: DbUserSettings) {
    this.rows = rows;
    this.settings = settings;
  }

  async findSettings(): Promise<DbUserSettings> {
    return this.settings;
  }

  async findAllNeedToControl(): Promise<DbTorrentItem[]> {
    return this.rows;
  }

  async markAsProcessing(id: number): Promise<void> {
    this.processed.push(id);
  }

  async markAsIdle(id: number): Promise<void> {
    this.idled.push(id);
  }

  async markAsCompleted(id: number): Promise<void> {
    this.completed.push(id);
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

describe('DownloadWorker errorMessage persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists errorMessage when add() fails on downloadRequested', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const row: DbTorrentItem = { ...baseItem, controlStatus: 'downloadRequested' };
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    add.mockRejectedValueOnce(new Error('add failed'));

    await worker.process();

    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('Failed to start downloading');
  });

  it('persists errorMessage and marks idle when status() rejects with "Torrent not found"', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const row: DbTorrentItem = { ...baseItem, controlStatus: 'downloading' };
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockRejectedValueOnce(new Error('Torrent not found'));

    await worker.process();

    expect(repo.idled).toEqual([row.id]);
    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('Failed to check download status');
  });

  it('persists errorMessage when selectEpisodes() fails during downloading', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const row: DbTorrentItem = { ...baseItem, controlStatus: 'downloading' };
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    status.mockResolvedValueOnce({ isCompleted: false } as { isCompleted: boolean });
    selectEpisodes.mockRejectedValueOnce(new Error('select failed'));

    await worker.process();

    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('Error selecting episodes');
  });

  it('persists errorMessage when checkFiles() encounters unexpected fs error', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const row: DbTorrentItem = {
      ...baseItem,
      controlStatus: 'idle',
      files: ['/tmp/error.mkv'],
    };
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    const prev = process.env.HOOP_LAST_SYNC;
    process.env.HOOP_LAST_SYNC = Date.now().toString();

    const statSpy = vi.spyOn(fs, 'stat');
    statSpy.mockImplementationOnce(async () => {
      const err = new Error('unexpected') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    await worker.process();

    const errUpdate = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(statSpy).toHaveBeenCalledTimes(1);
    expect(errUpdate).toBeDefined();
    expect(String(errUpdate?.data.errorMessage)).toContain('Failed to check files');

    if (prev === undefined) delete process.env.HOOP_LAST_SYNC;
    else process.env.HOOP_LAST_SYNC = prev;
  });

  it('clears errorMessage when iteration succeeds without errors', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const row: DbTorrentItem = { ...baseItem, controlStatus: 'idle', errorMessage: 'prev' };
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    // Do not set HOOP_LAST_SYNC to skip checkFiles path and keep iteration clean
    await worker.process();

    const clearUpdate = repo.updates.find((u) => Object.prototype.hasOwnProperty.call(u.data, 'errorMessage'));
    expect(clearUpdate).toBeDefined();
    expect(clearUpdate?.data.errorMessage).toBeNull();
  });
});
