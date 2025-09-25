import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));

import { TransmissionClientRepo } from '@server/external/adapters/transmission/transmission.repo';
import type {
  DbTorrentItem,
  DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

const selectQueue: Array<Array<DbTorrentItem>> = [];
const updateQueue: Array<Array<DbTorrentItem> | null> = [];
let lastUpdateSet: Partial<DbTorrentItemInsert> | null = null;

const makeAwaitable = <T>(value: T) => ({
  then: (onFulfilled?: (v: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(value).then(onFulfilled, onRejected),
  catch: (onRejected: (reason: unknown) => unknown) =>
    Promise.resolve(value).catch(onRejected),
  finally: (onFinally: () => void) => Promise.resolve(value).finally(onFinally),
});

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => makeAwaitable(selectQueue.shift() ?? [])),
    })),
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
} as const;

const repo = new TransmissionClientRepo(database as unknown as BunSQLiteDatabase);

function makeRow(override: Partial<DbTorrentItem> = {}): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tid-1',
    rawTitle: 'Raw',
    title: 'Pretty',
    url: 'https://example.com',
    magnet: 'magnet:?hash',
    season: null,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: null,
    files: [],
    createdAt: 1,
    updatedAt: 2,
    transmissionId: null,
    controlStatus: 'idle',
    tracker: 'kinozal',
    errorMessage: null,
    ...override,
  } satisfies DbTorrentItem;
}

describe('TransmissionClientRepo (mocked database)', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updateQueue.length = 0;
    lastUpdateSet = null;
  });

  it('returns row by id or null', async () => {
    selectQueue.push([makeRow({ id: 5 })]);

    const found = await repo.findTorrentItemById(5);
    expect(found?.id).toBe(5);

    selectQueue.push([]);
    const missing = await repo.findTorrentItemById(6);
    expect(missing).toBeNull();
  });

  it('updates row and returns it', async () => {
    const updated = makeRow({ id: 3, controlStatus: 'processing' });
    updateQueue.push([updated]);

    const result = await repo.updateTorrentItem(3, { controlStatus: 'processing' });

    expect(lastUpdateSet?.controlStatus).toBe('processing');
    expect(result?.id).toBe(3);
  });

  it('returns null when update has no returning row', async () => {
    updateQueue.push(null);

    const result = await repo.updateTorrentItem(4, { controlStatus: 'idle' });

    expect(result).toBeNull();
  });
});
