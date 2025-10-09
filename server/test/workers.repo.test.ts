import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));
vi.mock('better-auth', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { WorkersRepo } from '@server/workers/workers.repo';
import type {
  DbTorrentItem,
  DbTorrentItemInsert,
  DbUserSettings,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { logger } from 'better-auth';

const selectFromQueue: Array<Array<DbTorrentItem | DbUserSettings> | null> = [];
const selectWhereQueue: Array<Array<DbTorrentItem> | null> = [];
const updateReturningQueue: Array<Array<DbTorrentItem> | null> = [];
const updateSetCalls: Array<Partial<DbTorrentItemInsert>> = [];
type Awaitable<T> = {
  then: (
    onFulfilled?: ((value: T) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>;
  catch: (onRejected: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally: () => void) => Promise<unknown>;
};

const makeAwaitable = <T>(value: T): Awaitable<T> => ({
  then: (onFulfilled, onRejected) =>
    Promise.resolve(value).then(onFulfilled ?? undefined, onRejected ?? undefined),
  catch: (onRejected) => Promise.resolve(value).catch(onRejected),
  finally: (onFinally) => Promise.resolve(value).finally(onFinally),
});

const makeAwaitableFrom = (
  rows: Array<DbTorrentItem | DbUserSettings> | null
) => {
  const awaitable = makeAwaitable(rows ?? []);
  return Object.assign(awaitable, {
    where: vi.fn(() => makeAwaitable(selectWhereQueue.shift() ?? null)),
  });
};

const makeAwaitableWhere = (rows: Array<DbTorrentItem> | null) => {
  const awaitable = makeAwaitable(undefined);
  return Object.assign(awaitable, {
    returning: vi.fn(async () => rows ?? []),
  });
};

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => makeAwaitableFrom(selectFromQueue.shift() ?? null)),
  })),
  update: vi.fn(() => ({
    set: vi.fn((set: Partial<DbTorrentItemInsert>) => {
      updateSetCalls.push(set);
      return {
        where: vi.fn(() => {
          const rows = updateReturningQueue.shift() ?? null;
          return makeAwaitableWhere(rows);
        }),
      };
    }),
  })),
} as const;

const repo = new WorkersRepo(database as unknown as BunSQLiteDatabase);

function makeTorrent(
  override: Partial<DbTorrentItem> = {}
): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tid-1',
    rawTitle: 'Raw',
    title: 'Show',
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

function makeSettings(
  override: Partial<DbUserSettings> = {}
): DbUserSettings {
  return {
    id: 1,
    telegramId: 123,
    botToken: 'token',
    downloadDir: '/downloads',
    mediaDir: '/media',
    deleteAfterDownload: false,
    syncInterval: 30,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null,
    kinozalPassword: null,
    ...override,
  } satisfies DbUserSettings;
}

describe('WorkersRepo (mocked database)', () => {
  beforeEach(() => {
    selectFromQueue.length = 0;
    selectWhereQueue.length = 0;
    updateReturningQueue.length = 0;
    updateSetCalls.length = 0;
    vi.mocked(logger.warn).mockClear();
  });

  it('finds all records with idle status', async () => {
    selectFromQueue.push(null);
    selectWhereQueue.push([
      makeTorrent({ id: 1 }),
      makeTorrent({ id: 2, controlStatus: 'idle' }),
    ]);

    const rows = await repo.findAllIdle();

    expect(rows).toHaveLength(2);
    expect(rows?.every((row) => row.controlStatus === 'idle')).toBe(true);
  });

  it('returns items for expected statuses', async () => {
    selectFromQueue.push(null);
    selectWhereQueue.push([
      makeTorrent({ controlStatus: 'downloading' }),
      makeTorrent({ controlStatus: 'downloadCompleted' }),
    ]);

    const rows = await repo.findAllNeedToControl();

    expect(rows).toHaveLength(2);
  });

  it('returns null when no items exist', async () => {
    selectFromQueue.push(null);
    selectWhereQueue.push(null);

    const rows = await repo.findAllNeedToControl();

    expect(rows).toBeNull();
  });

  it('warns when more than one settings row exists', async () => {
    selectFromQueue.push([
      makeSettings({ id: 1 }),
      makeSettings({ id: 2 }),
    ]);

    const settings = await repo.findSettings();

    expect(settings?.id).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith('More than one settings found');
  });

  it('marks record as completed', async () => {
    updateReturningQueue.push(null);

    await repo.markAsCompleted(5);

    expect(updateSetCalls.at(-1)).toMatchObject({ controlStatus: 'downloadCompleted' });
  });

  it('marks record as processing', async () => {
    updateReturningQueue.push(null);

    await repo.markAsProcessing(3);

    expect(updateSetCalls.at(-1)).toMatchObject({ controlStatus: 'processing' });
  });

  it('resets record to idle and clears transmissionId', async () => {
    updateReturningQueue.push(null);

    await repo.markAsIdle(7);

    expect(updateSetCalls.at(-1)).toMatchObject({
      controlStatus: 'idle',
      transmissionId: null,
    });
  });

  it('updates record and returns row from returning', async () => {
    const returning = makeTorrent({ id: 9, trackerId: 'tid-9' });
    updateReturningQueue.push([returning]);

    const row = await repo.update(9, { trackerId: 'tid-9' });

    expect(updateSetCalls.at(-1)?.trackerId).toBe('tid-9');
    expect(row?.id).toBe(9);
  });
});
