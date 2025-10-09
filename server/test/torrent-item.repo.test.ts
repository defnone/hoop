import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));

import { TorrentItemRepo } from '@server/features/torrent-item/torrent-item.repo';
import type {
  DbTorrentItem,
  DbTorrentItemInsert,
} from '@server/db/app/app-schema';

const selectAllQueue: Array<Array<Record<string, unknown>>> = [];
const whereQueue: Array<Array<Record<string, unknown>>> = [];
const upsertQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: unknown[] = [];

let lastOffset: number | null = null;
let lastLimit: number | null = null;
let lastInsertValues: DbTorrentItemInsert | null = null;
let lastUpdateSet: Partial<DbTorrentItemInsert> | null = null;

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn((limit: number) => {
          lastLimit = limit;
          return {
            offset: vi.fn(async (offset: number) => {
              lastOffset = offset;
              return selectAllQueue.shift() ?? [];
            }),
          };
        }),
      })),
      where: vi.fn(async () => whereQueue.shift() ?? []),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((values: DbTorrentItemInsert) => {
      lastInsertValues = values;
      return {
        returning: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => upsertQueue.shift() ?? []),
        })),
      };
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn((set: Partial<DbTorrentItemInsert>) => {
      lastUpdateSet = set;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateQueue.shift() ?? []),
        })),
      };
    }),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(async (condition: unknown) => {
      deleteCalls.push(condition);
    }),
  })),
} as const;

import type { Database } from 'bun:sqlite';
const repo = new TorrentItemRepo({
  ...database,
  $client: {} as unknown as Database,
} as never);

function makeRow(
  override: Partial<DbTorrentItem> = {}
): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tid-1',
    rawTitle: 'Raw',
    title: 'Show',
    url: 'https://example.com/1',
    magnet: 'magnet:hash',
    season: 1,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: 5,
    files: [],
    createdAt: 111,
    updatedAt: 222,
    transmissionId: null,
    controlStatus: 'idle',
    tracker: 'kinozal',
    errorMessage: null,
    ...override,
  } satisfies DbTorrentItem;
}

describe('TorrentItemRepo (mocked database)', () => {
  beforeEach(() => {
    selectAllQueue.length = 0;
    whereQueue.length = 0;
    upsertQueue.length = 0;
    updateQueue.length = 0;
    deleteCalls.length = 0;
    lastOffset = null;
    lastLimit = null;
    lastInsertValues = null;
    lastUpdateSet = null;
  });

  it('returns paginated list with total', async () => {
    selectAllQueue.push([
      { total: 5, ...makeRow({ id: 1 }) },
      { total: 5, ...makeRow({ id: 2, trackerId: 'tid-2' }) },
    ]);

    const result = await repo.findAll(2, 3);

    expect(lastLimit).toBe(3);
    expect(lastOffset).toBe(3);
    expect(result.total).toBe(5);
    expect(result.items.map((i) => i.id)).toEqual([1, 2]);
  });

  it('finds record by id and tracker id', async () => {
    whereQueue.push([makeRow({ id: 10 })]);
    const byId = await repo.findById(10);

    whereQueue.push([makeRow({ trackerId: 'tid-5' })]);
    const byTracker = await repo.findByTrackerId('tid-5');

    expect(byId?.id).toBe(10);
    expect(byTracker?.trackerId).toBe('tid-5');
  });

  it('upserts record and maps returning row', async () => {
    const returningRow = makeRow({ id: 7, trackerId: 'tid-7', haveEpisodes: [1, 2] });
    upsertQueue.push([returningRow]);

    const data: DbTorrentItemInsert = {
      trackerId: 'tid-7',
      rawTitle: 'Raw-7',
      title: 'Show-7',
      url: 'https://example.com/7',
      magnet: 'magnet:7',
      season: 1,
      trackedEpisodes: [],
      haveEpisodes: [],
      totalEpisodes: 8,
      files: [],
      createdAt: 0,
      updatedAt: 0,
      transmissionId: null,
      controlStatus: 'idle',
      tracker: 'kinozal',
      errorMessage: null,
    };

    const row = await repo.upsert(data);

    expect(lastInsertValues?.trackerId).toBe('tid-7');
    expect(row?.id).toBe(7);
    expect(row?.haveEpisodes).toEqual([1, 2]);
  });

  it('updates record fields via update()', async () => {
    const updatedRow = makeRow({ id: 3, trackedEpisodes: [4, 5] });
    updateQueue.push([updatedRow]);

    const result = await repo.update(3, { trackedEpisodes: [4, 5] });

    expect(lastUpdateSet?.trackedEpisodes).toEqual([4, 5]);
    expect(result?.trackedEpisodes).toEqual([4, 5]);
  });

  it('deletes record by id', async () => {
    await repo.deleteById(9);
    expect(deleteCalls.length).toBe(1);
  });
});
