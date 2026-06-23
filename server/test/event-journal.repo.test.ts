import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));

import { EventJournalRepo } from '@server/features/event-journal/event-journal.repo';
import type {
  DbEventJournal,
  DbEventJournalInsert,
} from '@server/db/app/app-schema';
import type { Database } from 'bun:sqlite';

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const insertQueue: Array<Array<DbEventJournal>> = [];
const updateQueue: Array<Array<DbEventJournal>> = [];
const whereCalls: unknown[] = [];

let lastOffset: number | null = null;
let lastLimit: number | null = null;
let lastInsertValues: DbEventJournalInsert | null = null;
let lastUpdateSet: Partial<DbEventJournalInsert> | null = null;

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn((limit: number) => {
          lastLimit = limit;
          return {
            offset: vi.fn(async (offset: number) => {
              lastOffset = offset;
              return selectQueue.shift() ?? [];
            }),
          };
        }),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((values: DbEventJournalInsert) => {
      lastInsertValues = values;
      return {
        returning: vi.fn(async () => insertQueue.shift() ?? []),
      };
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn((set: Partial<DbEventJournalInsert>) => {
      lastUpdateSet = set;
      return {
        where: vi.fn((condition: unknown) => {
          whereCalls.push(condition);
          return {
            returning: vi.fn(async () => updateQueue.shift() ?? []),
          };
        }),
      };
    }),
  })),
} as const;

const repo = new EventJournalRepo({
  ...database,
  $client: {} as unknown as Database,
} as never);

function makeEvent(override: Partial<DbEventJournal> = {}): DbEventJournal {
  return {
    id: 1,
    type: 'torrentTitleChanged',
    state: 'info',
    torrentItemId: 3,
    torrentTitle: 'Some Show',
    oldValue: 'Old title',
    newValue: 'New title',
    isNotification: true,
    readAt: null,
    createdAt: 1000,
    ...override,
  } satisfies DbEventJournal;
}

describe('EventJournalRepo (mocked database)', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertQueue.length = 0;
    updateQueue.length = 0;
    whereCalls.length = 0;
    lastOffset = null;
    lastLimit = null;
    lastInsertValues = null;
    lastUpdateSet = null;
  });

  it('returns paginated events with total', async () => {
    selectQueue.push([
      { total: 2, ...makeEvent({ id: 1 }) },
      { total: 2, ...makeEvent({ id: 2, type: 'torrentMagnetChanged' }) },
    ]);

    const result = await repo.findAll(2, 10);

    expect(lastLimit).toBe(10);
    expect(lastOffset).toBe(10);
    expect(result.total).toBe(2);
    expect(result.items.map((event) => event.id)).toEqual([1, 2]);
  });

  it('creates an event', async () => {
    insertQueue.push([makeEvent({ id: 7 })]);

    const row = await repo.create({
      type: 'torrentMagnetChanged',
      state: 'info',
      torrentItemId: 7,
      torrentTitle: 'Some Show',
      oldValue: 'Old magnet',
      newValue: 'New magnet',
      isNotification: true,
    });

    expect(lastInsertValues?.type).toBe('torrentMagnetChanged');
    expect(lastInsertValues?.state).toBe('info');
    expect(lastInsertValues?.isNotification).toBe(true);
    expect(row?.id).toBe(7);
  });

  it('marks an event as read', async () => {
    updateQueue.push([makeEvent({ id: 9, readAt: 2000 })]);

    const row = await repo.markAsRead(9);

    expect(typeof lastUpdateSet?.readAt).toBe('number');
    expect(row?.readAt).toBe(2000);
  });

  it('marks all unread events as read', async () => {
    updateQueue.push([
      makeEvent({ id: 1, readAt: 3000 }),
      makeEvent({ id: 2, readAt: 3000 }),
    ]);

    const rows = await repo.markAllAsRead();

    expect(typeof lastUpdateSet?.readAt).toBe('number');
    expect(whereCalls.length).toBe(1);
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
  });
});
