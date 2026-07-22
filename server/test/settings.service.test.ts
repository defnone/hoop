import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@server/db', () => ({ default: {} as never }));

import { SettingsRepo } from '@server/features/settings/settings.repo';
import { SettingsService } from '@server/features/settings/settings.service';
import type {
  DbUserSettings,
  DbUserSettingsInsert,
} from '@server/db/app/app-schema';

const selectQueue: Array<Array<Record<string, unknown>>> = [];
const upsertQueue: Array<Array<Record<string, unknown>>> = [];
const updateQueue: Array<Array<Record<string, unknown>>> = [];
let lastUpsertValues: Omit<DbUserSettingsInsert, 'id'> | null = null;
let lastUpdateValues: Partial<Omit<DbUserSettingsInsert, 'id'>> | null = null;

import type { Database } from 'bun:sqlite';

const database = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => selectQueue.shift() ?? []),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(
      (values: Omit<DbUserSettingsInsert, 'id'> & { id?: number }) => {
        const { id: _id, ...rest } = values;
        lastUpsertValues = rest;
        return {
          returning: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(async () => upsertQueue.shift() ?? []),
          })),
        };
      },
    ),
  })),
  update: vi.fn(() => ({
    set: vi.fn((values: Partial<Omit<DbUserSettingsInsert, 'id'>>) => {
      lastUpdateValues = values;
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateQueue.shift() ?? []),
        })),
      };
    }),
  })),
} as const;

const repo = new SettingsRepo({
  ...database,
  $client: {} as unknown as Database,
} as never);

function makeSettingsRow(
  override: Partial<DbUserSettings> = {},
): DbUserSettings {
  return {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: '/downloads',
    mediaDir: '/media',
    cleanEmptySeriesDirectories: false,
    deleteAfterDownload: false,
    syncInterval: 30,
    torrentClientType: 'transmission',
    torrentClientUrl: null,
    torrentClientUsername: null,
    torrentClientPassword: null,
    jackettApiKey: null,
    jackettUrl: null,
    kinozalUsername: null,
    kinozalPassword: null,
    flaresolverrEnabled: false,
    flaresolverrUrl: null,
    flaresolverrTimeoutSeconds: 60,
    ...override,
  } satisfies DbUserSettings;
}

describe('SettingsRepo (mocked database)', () => {
  beforeEach(() => {
    selectQueue.length = 0;
    upsertQueue.length = 0;
    updateQueue.length = 0;
    lastUpsertValues = null;
    lastUpdateValues = null;
  });

  it('upserts settings row and returns value', async () => {
    const returningRow = makeSettingsRow({ downloadDir: '/dl' });
    upsertQueue.push([returningRow]);

    const payload: Omit<DbUserSettingsInsert, 'id'> = {
      telegramId: null,
      botToken: null,
      downloadDir: '/dl',
      mediaDir: '/media',
      cleanEmptySeriesDirectories: false,
      deleteAfterDownload: false,
      syncInterval: 20,
      jackettApiKey: null,
      jackettUrl: null,
      kinozalUsername: null,
      kinozalPassword: null,
      flaresolverrEnabled: false,
      flaresolverrUrl: null,
      flaresolverrTimeoutSeconds: 60,
    };

    const inserted = await repo.upsert(payload);

    expect(lastUpsertValues?.downloadDir).toBe('/dl');
    expect(inserted?.downloadDir).toBe('/dl');
  });

  it('updates existing settings', async () => {
    const updatedRow = makeSettingsRow({ mediaDir: '/mnt/media' });
    updateQueue.push([updatedRow]);

    const result = await repo.update({ mediaDir: '/mnt/media' });

    expect(lastUpdateValues?.mediaDir).toBe('/mnt/media');
    expect(result?.mediaDir).toBe('/mnt/media');
  });

  it('fetches stored settings or null', async () => {
    selectQueue.push([makeSettingsRow({ syncInterval: 10 })]);
    const existing = await repo.findSettings();
    expect(existing?.syncInterval).toBe(10);

    const none = await repo.findSettings();
    expect(none).toBeNull();
  });
});

describe('SettingsService', () => {
  it('rejects changing client while another client has active torrents', async () => {
    class RepoMock extends SettingsRepo {
      public findSettings = vi.fn(
        async (): Promise<DbUserSettings> =>
          makeSettingsRow({ torrentClientType: 'transmission' }),
      );
      public hasActiveTorrentForOtherClient = vi.fn(async () => true);
      public upsert = vi.fn(async (): Promise<DbUserSettings | null> => null);
    }

    const service = new SettingsService({
      repo: new RepoMock({} as never),
      data: {
        torrentClientType: 'qbittorrent',
      },
    });

    await expect(service.upsert()).rejects.toThrow(
      'Cannot change torrent client while downloads are active',
    );
  });

  it('throws when updating without data', async () => {
    class RepoMock extends SettingsRepo {
      public findSettings = vi.fn(
        async (): Promise<DbUserSettings | null> => null,
      );
      public upsert = vi.fn(
        async (
          _payload: Omit<DbUserSettingsInsert, 'id'>,
        ): Promise<DbUserSettings | null> => null,
      );
      public update = vi.fn(
        async (
          _payload: Partial<Omit<DbUserSettingsInsert, 'id'>>,
        ): Promise<DbUserSettings | null> => null,
      );
    }

    const service = new SettingsService({ repo: new RepoMock({} as never) });

    await expect(service.upsert()).rejects.toThrow('No data provided');
    await expect(service.update()).rejects.toThrow('No data provided');
  });

  it('delegates to repo when data present', async () => {
    const data: Omit<DbUserSettingsInsert, 'id'> = {
      telegramId: null,
      botToken: null,
      downloadDir: '/dl',
      mediaDir: '/media',
      deleteAfterDownload: false,
      syncInterval: 15,
      torrentClientType: 'transmission',
      torrentClientUrl: 'http://localhost:9091/transmission/rpc',
      torrentClientUsername: 'user',
      torrentClientPassword: 'password',
      jackettApiKey: null,
      jackettUrl: null,
      kinozalUsername: null,
      kinozalPassword: null,
    };
    const fullData = data as Required<Omit<DbUserSettingsInsert, 'id'>>;

    class RepoMock2 extends SettingsRepo {
      public findSettings = vi.fn(
        async (): Promise<DbUserSettings | null> =>
          ({
            id: 1,
            telegramId: fullData.telegramId,
            botToken: fullData.botToken,
            downloadDir: fullData.downloadDir,
            mediaDir: fullData.mediaDir,
            cleanEmptySeriesDirectories: fullData.cleanEmptySeriesDirectories,
            deleteAfterDownload: fullData.deleteAfterDownload,
            syncInterval: fullData.syncInterval,
            torrentClientType: fullData.torrentClientType,
            torrentClientUrl: fullData.torrentClientUrl,
            torrentClientUsername: fullData.torrentClientUsername,
            torrentClientPassword: fullData.torrentClientPassword,
            jackettApiKey: fullData.jackettApiKey,
            jackettUrl: fullData.jackettUrl,
            kinozalUsername: fullData.kinozalUsername,
            kinozalPassword: fullData.kinozalPassword,
            flaresolverrEnabled: fullData.flaresolverrEnabled,
            flaresolverrUrl: fullData.flaresolverrUrl,
            flaresolverrTimeoutSeconds: fullData.flaresolverrTimeoutSeconds,
          }) satisfies DbUserSettings,
      );
      public upsert = vi.fn(
        async (
          payload: Omit<DbUserSettingsInsert, 'id'>,
        ): Promise<DbUserSettings | null> =>
          ({
            id: 1,
            telegramId: payload.telegramId ?? fullData.telegramId,
            botToken: payload.botToken ?? fullData.botToken,
            downloadDir: payload.downloadDir ?? fullData.downloadDir,
            mediaDir: payload.mediaDir ?? fullData.mediaDir,
            cleanEmptySeriesDirectories:
              payload.cleanEmptySeriesDirectories ??
              fullData.cleanEmptySeriesDirectories,
            deleteAfterDownload:
              payload.deleteAfterDownload ?? fullData.deleteAfterDownload,
            syncInterval: payload.syncInterval ?? fullData.syncInterval,
            torrentClientType:
              payload.torrentClientType ?? fullData.torrentClientType,
            torrentClientUrl:
              payload.torrentClientUrl ?? fullData.torrentClientUrl,
            torrentClientUsername:
              payload.torrentClientUsername ?? fullData.torrentClientUsername,
            torrentClientPassword:
              payload.torrentClientPassword ?? fullData.torrentClientPassword,
            jackettApiKey: payload.jackettApiKey ?? fullData.jackettApiKey,
            jackettUrl: payload.jackettUrl ?? fullData.jackettUrl,
            kinozalUsername:
              payload.kinozalUsername ?? fullData.kinozalUsername,
            kinozalPassword:
              payload.kinozalPassword ?? fullData.kinozalPassword,
            flaresolverrEnabled:
              payload.flaresolverrEnabled ?? fullData.flaresolverrEnabled,
            flaresolverrUrl:
              payload.flaresolverrUrl ?? fullData.flaresolverrUrl,
            flaresolverrTimeoutSeconds:
              payload.flaresolverrTimeoutSeconds ??
              fullData.flaresolverrTimeoutSeconds,
          }) satisfies DbUserSettings,
      );
      public update = vi.fn(
        async (
          payload: Partial<Omit<DbUserSettingsInsert, 'id'>>,
        ): Promise<DbUserSettings | null> =>
          ({
            id: 1,
            telegramId: payload.telegramId ?? fullData.telegramId,
            botToken: payload.botToken ?? fullData.botToken,
            downloadDir: payload.downloadDir ?? fullData.downloadDir,
            mediaDir: payload.mediaDir ?? fullData.mediaDir,
            cleanEmptySeriesDirectories:
              payload.cleanEmptySeriesDirectories ??
              fullData.cleanEmptySeriesDirectories,
            deleteAfterDownload:
              payload.deleteAfterDownload ?? fullData.deleteAfterDownload,
            syncInterval: payload.syncInterval ?? fullData.syncInterval,
            torrentClientType:
              payload.torrentClientType ?? fullData.torrentClientType,
            torrentClientUrl:
              payload.torrentClientUrl ?? fullData.torrentClientUrl,
            torrentClientUsername:
              payload.torrentClientUsername ?? fullData.torrentClientUsername,
            torrentClientPassword:
              payload.torrentClientPassword ?? fullData.torrentClientPassword,
            jackettApiKey: payload.jackettApiKey ?? fullData.jackettApiKey,
            jackettUrl: payload.jackettUrl ?? fullData.jackettUrl,
            kinozalUsername:
              payload.kinozalUsername ?? fullData.kinozalUsername,
            kinozalPassword:
              payload.kinozalPassword ?? fullData.kinozalPassword,
            flaresolverrEnabled:
              payload.flaresolverrEnabled ?? fullData.flaresolverrEnabled,
            flaresolverrUrl:
              payload.flaresolverrUrl ?? fullData.flaresolverrUrl,
            flaresolverrTimeoutSeconds:
              payload.flaresolverrTimeoutSeconds ??
              fullData.flaresolverrTimeoutSeconds,
          }) satisfies DbUserSettings,
      );
    }

    const service = new SettingsService({
      repo: new RepoMock2({} as never),
      data,
    });

    const inserted = await service.upsert();
    expect(inserted?.id).toBe(1);
    expect(
      (service as unknown as { repo: RepoMock2 }).repo.upsert,
    ).toHaveBeenCalledWith(data);

    const fetched = await service.getSettings();
    expect(fetched?.id).toBe(1);
    expect(
      (service as unknown as { repo: RepoMock2 }).repo.findSettings,
    ).toHaveBeenCalledTimes(2);

    const updated = await service.update();
    expect(updated?.id).toBe(1);
    expect(
      (service as unknown as { repo: RepoMock2 }).repo.update,
    ).toHaveBeenCalledWith(data);
  });
});
