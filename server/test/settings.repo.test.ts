import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));

import { SettingsRepo } from '@server/features/settings/settings.repo';
import type {
  DbUserSettings,
  DbUserSettingsInsert,
} from '@server/db/app/app-schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

const selectQueue: Array<Array<DbUserSettings>> = [];
const upsertQueue: Array<Array<DbUserSettings>> = [];
const updateQueue: Array<Array<DbUserSettings>> = [];

let lastInsertValues: DbUserSettingsInsert | null = null;
let lastUpdateSet: Partial<Omit<DbUserSettingsInsert, 'id'>> | null = null;

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => selectQueue.shift() ?? []),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((values: DbUserSettingsInsert) => {
      lastInsertValues = values;
      return {
        returning: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => upsertQueue.shift() ?? []),
        })),
      };
    }),
  })),
  update: vi.fn(() => ({
    set: vi.fn((set: Partial<Omit<DbUserSettingsInsert, 'id'>>) => {
      lastUpdateSet = set;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateQueue.shift() ?? []),
        })),
      };
    }),
  })),
} as const;

const repo = new SettingsRepo(database as unknown as BunSQLiteDatabase);

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

describe('SettingsRepo (mocked database)', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    upsertQueue.length = 0;
    updateQueue.length = 0;
    lastInsertValues = null;
    lastUpdateSet = null;
  });

  it('returns settings row when present', async () => {
    selectQueue.push([makeSettings({ id: 1 })]);

    const result = await repo.findSettings();

    expect(result?.id).toBe(1);
  });

  it('returns null when no rows exist', async () => {
    selectQueue.push([]);

    const result = await repo.findSettings();

    expect(result).toBeNull();
  });

  it('upsert sets id to 1 and returns stored row', async () => {
    const returningRow = makeSettings({ id: 1, telegramId: 456 });
    upsertQueue.push([returningRow]);

    const payload: Omit<DbUserSettingsInsert, 'id'> = {
      telegramId: 456,
      botToken: 'new-token',
      downloadDir: '/downloads',
      mediaDir: '/media',
      deleteAfterDownload: true,
      syncInterval: 45,
      jackettApiKey: 'abc',
      jackettUrl: 'https://jackett.dev',
      kinozalUsername: 'user',
      kinozalPassword: 'pass',
    };

    const result = await repo.upsert(payload);

    expect(lastInsertValues?.id).toBe(1);
    expect(result?.telegramId).toBe(456);
  });

  it('update passes fields and returns row', async () => {
    const returningRow = makeSettings({ mediaDir: '/new-media' });
    updateQueue.push([returningRow]);

    const result = await repo.update({ mediaDir: '/new-media' });

    expect(lastUpdateSet?.mediaDir).toBe('/new-media');
    expect(result?.mediaDir).toBe('/new-media');
  });
});
