import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@server/db', () => ({ default: {} as never }));
import type { TorrentDataResult } from '@server/external/adapters/tracker-data';
import type {
  DbTorrentItem,
  DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import type { TorrentItemRepo } from '@server/features/torrent-item/torrent-item.repo';

vi.mock('@server/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

const trackerCollectMock = vi.fn<[], Promise<TorrentDataResult>>();
const trackerCtorCalls: Array<{ url: string; tracker: string }> = [];

vi.mock('@server/external/adapters/tracker-data', () => ({
  TrackerDataAdapter: class {
    constructor(args: { url: string; tracker: string }) {
      trackerCtorCalls.push(args);
    }

    collect() {
      return trackerCollectMock();
    }
  },
}));

const deleteFileMock = vi.fn<[string], Promise<boolean>>();

vi.mock('@server/features/file-management/file-management.service', () => ({
  FileManagementService: class {
    async deleteFile(filePath: string): Promise<boolean> {
      return deleteFileMock(filePath);
    }
  },
}));

type RepoMock = {
  findAll: ReturnType<
    typeof vi.fn<[number, number], Promise<{ items: DbTorrentItem[]; total: number }>>
  >;
  findById: ReturnType<typeof vi.fn<[number], Promise<DbTorrentItem | null>>>;
  upsert: ReturnType<
    typeof vi.fn<[DbTorrentItemInsert], Promise<DbTorrentItem | undefined>>
  >;
  deleteById: ReturnType<typeof vi.fn<[number], Promise<void>>>;
  update: ReturnType<
    typeof vi.fn<
      [number, Partial<DbTorrentItemInsert>],
      Promise<DbTorrentItem | undefined>
    >
  >;
} &
  Pick<
    TorrentItemRepo,
    'findAll' | 'findById' | 'upsert' | 'deleteById' | 'update'
  >;

function createRepoMock(): RepoMock {
  const repo = {
    findAll: vi.fn<[number, number], Promise<{ items: DbTorrentItem[]; total: number }>>(),
    findById: vi.fn<[number], Promise<DbTorrentItem | null>>(),
    upsert: vi.fn<[DbTorrentItemInsert], Promise<DbTorrentItem | undefined>>(),
    deleteById: vi.fn<[number], Promise<void>>(),
    update: vi.fn<
      [number, Partial<DbTorrentItemInsert>],
      Promise<DbTorrentItem | undefined>
    >(),
  };
  return repo as RepoMock;
}

function createDbTorrentItem(
  override: Partial<DbTorrentItem> = {}
): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tid-1',
    rawTitle: 'Raw Title',
    title: 'Show Title',
    url: 'https://kinozal.tv/details.php?id=1',
    magnet: 'magnet:?xt=urn:btih:HASH',
    season: 1,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: 5,
    files: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    transmissionId: 'trans-1',
    controlStatus: 'idle',
    tracker: 'kinozal',
    errorMessage: null,
    ...override,
  } satisfies DbTorrentItem;
}

describe('TorrentItem service', () => {
  beforeEach(() => {
    trackerCollectMock.mockReset();
    trackerCtorCalls.length = 0;
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(true);
  });

  it('fetches tracker data based on URL and stores result', async () => {
    trackerCollectMock.mockResolvedValueOnce({
      torrentId: '1337',
      rawTitle: 'Raw',
      showTitle: 'My Show',
      magnet: 'magnet:hash',
      epAndSeason: {
        season: 2,
        startEp: 3,
        endEp: 4,
        totalEp: 8,
      },
    });

    const repo = createRepoMock();
    const item = new TorrentItem({
      url: 'https://kinozal.tv/details.php?id=1337',
      repo,
    });

    await item.fetchData();

    expect(trackerCtorCalls).toContainEqual({
      url: 'https://kinozal.tv/details.php?id=1337',
      tracker: 'kinozal',
    });
    expect(trackerCollectMock).toHaveBeenCalledTimes(1);
    expect(item.trackerId).toBe('1337');
    expect(item.trackerData?.showTitle).toBe('My Show');
  });

  it('builds paginated response with DTO mapping', async () => {
    const repo = createRepoMock();
    repo.findAll.mockResolvedValue({
      items: [createDbTorrentItem({ id: 1 }), createDbTorrentItem({ id: 2 })],
      total: 5,
    });

    const item = new TorrentItem({ url: 'https://kinozal.tv/details.php?id=1', repo });
    const result = await item.getAll(1, 2);

    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.hasNext).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: 1, trackerId: 'tid-1' });
  });

  it('retrieves item by id and caches database data', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ id: 42, files: ['f1'] });
    repo.findById.mockResolvedValue(dbItem);

    const item = new TorrentItem({ id: 42, repo });
    const dto = await item.getById();

    expect(dto).toMatchObject({ id: 42, files: ['f1'] });
    expect(item.databaseData?.id).toBe(42);
  });

  it('adds or updates torrent item using tracker payload', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({
      id: 99,
      trackerId: '555',
      haveEpisodes: [3, 4],
      trackedEpisodes: [1, 2],
      totalEpisodes: 5,
    });
    repo.upsert.mockResolvedValue(dbItem);
    trackerCollectMock.mockResolvedValueOnce({
      torrentId: '555',
      rawTitle: 'Raw 555',
      showTitle: 'Show 555',
      magnet: 'magnet:555',
      epAndSeason: {
        season: 1,
        startEp: 3,
        endEp: 4,
        totalEp: 10,
      },
    });

    const item = new TorrentItem({
      url: 'https://kinozal.tv/details.php?id=555',
      repo,
    });

    const dto = await item.addOrUpdate();

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining<Partial<DbTorrentItemInsert>>({
        trackerId: '555',
        haveEpisodes: [3, 4],
        totalEpisodes: 10,
      })
    );
    expect(dto).toMatchObject({ id: 99, trackerId: '555', totalEpisodes: 5 });
    expect(item.id).toBe(99);
    expect(item.databaseData?.id).toBe(99);
  });

  it('returns null when repo upsert yields no row', async () => {
    const repo = createRepoMock();
    repo.upsert.mockResolvedValue(undefined);
    trackerCollectMock.mockResolvedValueOnce({
      torrentId: '700',
      rawTitle: 'Raw 700',
      showTitle: 'Show 700',
      magnet: 'magnet:700',
      epAndSeason: null,
    });

    const item = new TorrentItem({
      url: 'https://kinozal.tv/details.php?id=700',
      repo,
    });

    const dto = await item.addOrUpdate();

    expect(dto).toBeNull();
    expect(item.databaseData).toBeNull();
    expect(item.id).toBeUndefined();
  });

  it('deletes torrent and associated files when requested', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ files: ['f1.mkv', 'f2.mkv'] });
    repo.findById.mockResolvedValue(dbItem);
    repo.deleteById.mockResolvedValue();

    const item = new TorrentItem({ id: dbItem.id, repo });
    await item.delete(true);

    expect(deleteFileMock).toHaveBeenCalledTimes(2);
    expect(repo.deleteById).toHaveBeenCalledWith(dbItem.id);
  });

  it('throws when tracked episodes exceed available total', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ totalEpisodes: 5 });
    repo.findById.mockResolvedValue(dbItem);

    const item = new TorrentItem({ id: dbItem.id, repo });

    await expect(item.updateTrackedEpisodes([6])).rejects.toThrow(
      'Episode is greater than total episodes'
    );
  });

  it('updates tracked episodes when within bounds', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ totalEpisodes: 5 });
    repo.findById.mockResolvedValue(dbItem);
    repo.update.mockResolvedValue({ ...dbItem, trackedEpisodes: [1, 2, 3] });

    const item = new TorrentItem({ id: dbItem.id, repo });
    await item.updateTrackedEpisodes([1, 2, 3]);

    expect(repo.update).toHaveBeenCalledWith(dbItem.id, {
      trackedEpisodes: [1, 2, 3],
    });
  });

  it('marks torrent as download requested using cached data', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem();
    repo.update.mockResolvedValue({ ...dbItem, controlStatus: 'donwloadRequested' });

    const item = new TorrentItem({ id: dbItem.id, repo });
    item.databaseData = dbItem;

    await item.markAsDownloadRequested();

    expect(repo.update).toHaveBeenCalledWith(dbItem.id, {
      controlStatus: 'donwloadRequested',
    });
    expect(item.databaseData?.controlStatus).toBe('donwloadRequested');
  });

  it('marks all episodes as tracked', async () => {
    const repo = createRepoMock();
    repo.update.mockResolvedValue(createDbTorrentItem());

    const item = new TorrentItem({ id: 10, repo });
    item.databaseData = createDbTorrentItem({ totalEpisodes: 3 });

    await item.markAsTrackedAll();

    expect(repo.update).toHaveBeenCalledWith(10, {
      trackedEpisodes: [1, 2, 3],
    });
  });

  it('deletes single episode file when present', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ files: ['keep.mkv', 'remove.mkv'] });
    repo.findById.mockResolvedValue(dbItem);
    repo.update.mockResolvedValue({ ...dbItem, files: ['keep.mkv'] });

    const item = new TorrentItem({ id: dbItem.id, repo });
    await item.deleteFileEpisode('remove.mkv');

    expect(deleteFileMock).toHaveBeenCalledWith('remove.mkv');
    expect(repo.update).toHaveBeenCalledWith(dbItem.id, {
      files: ['keep.mkv'],
    });
  });

  it('skips deletion when file is absent in database record', async () => {
    const repo = createRepoMock();
    const dbItem = createDbTorrentItem({ files: ['keep.mkv'] });
    repo.findById.mockResolvedValue(dbItem);

    const item = new TorrentItem({ id: dbItem.id, repo });
    await item.deleteFileEpisode('ghost.mkv');

    expect(deleteFileMock).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
