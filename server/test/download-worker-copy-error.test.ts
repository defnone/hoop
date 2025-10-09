import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Avoid bun:sqlite import chain from WorkersRepo module
vi.mock('@server/workers/workers.repo', () => ({
  WorkersRepo: class {},
}));

// Mock adapters and services
vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    async add() { /* no-op */ }
    async status() { return { isCompleted: false, raw: { files: [] }, name: 'Test' }; }
    async selectEpisodes() { /* no-op */ }
    async remove() { /* no-op */ }
  },
}));

vi.mock('@server/external/adapters/telegram/telegram.adapter', () => ({
  TelegramAdapter: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_: any) {}
    sendUpdate(_title: string, _payload: Record<number, string>) { /* no-op */ }
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

class RepoMock {
  public updates: Array<{ id: number; data: Partial<DbTorrentItem> }> = [];
  public processed: number[] = [];
  public idled: number[] = [];
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

  async markAsCompleted(_id: number): Promise<void> {
    // not needed
  }

  async update(id: number, data: Partial<DbTorrentItem>): Promise<DbTorrentItem | undefined> {
    this.updates.push({ id, data });
    return undefined;
  }
}

describe('DownloadWorker copy failure persists errorMessage', () => {
  const row: DbTorrentItem = {
    id: 42,
    trackerId: 't-42',
    rawTitle: 'raw',
    title: 'Show',
    url: 'https://example.com/?t=42',
    magnet: 'magnet:?xt=urn:btih:HASH',
    season: 1,
    trackedEpisodes: [1],
    haveEpisodes: [],
    totalEpisodes: 10,
    files: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    transmissionId: 'abc',
    controlStatus: 'downloadCompleted',
    tracker: 'rutracker',
    errorMessage: null,
  } as const;

  const settings: DbUserSettings = {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: '/tmp/downloads',
    mediaDir: '/tmp/media',
    deleteAfterDownload: false,
    syncInterval: 30,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null,
    kinozalPassword: null,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets errorMessage on DB when copy fails during processing', async () => {
    const { DownloadWorker } = await import('@server/workers/download-worker');
    const repo = new RepoMock([row], settings);
    const worker = new DownloadWorker({ repo: repo as unknown as never });

    copyTrackedEpisodes.mockRejectedValueOnce(new Error('Copy failed'));

    await worker.process();

    // Assert flow: processing then idle on error
    expect(repo.processed).toEqual([row.id]);
    expect(repo.idled).toEqual([row.id]);

    // Assert that errorMessage was persisted
    const updateWithError = repo.updates.find((u) => typeof u.data.errorMessage === 'string');
    expect(updateWithError).toBeDefined();
    expect(String(updateWithError?.data.errorMessage)).toContain('Error processing completed download');
  });
});
