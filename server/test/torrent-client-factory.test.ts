import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';

const clients = vi.hoisted(() => ({
  transmissionOptions: null as Record<string, string> | null,
  qbittorrentOptions: null as Record<string, string> | null,
}));

let settings: DbUserSettings;

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings(): Promise<DbUserSettings> {
      return settings;
    }
  },
}));

vi.mock('@ctrl/transmission', () => ({
  Transmission: class {
    constructor(options: Record<string, string>) {
      clients.transmissionOptions = options;
    }
  },
}));

vi.mock('@ctrl/qbittorrent', () => ({
  QBittorrent: class {
    constructor(options: Record<string, string>) {
      clients.qbittorrentOptions = options;
    }
  },
}));

vi.mock('@server/external/adapters/transmission', () => ({
  TransmissionAdapter: class {
    readonly kind = 'transmission';
  },
}));

vi.mock('@server/external/adapters/qbittorrent', () => ({
  QbittorrentAdapter: class {
    readonly kind = 'qbittorrent';
  },
}));

import { createTorrentClient } from '@server/external/adapters/torrent-client';

describe('createTorrentClient', () => {
  beforeEach(() => {
    settings = createSettings();
    clients.transmissionOptions = null;
    clients.qbittorrentOptions = null;
    process.env.TRANSMISSION_BASE_URL = 'http://transmission:9091';
    process.env.TRANSMISSION_USERNAME = 'env-user';
    process.env.TRANSMISSION_PASSWORD = 'env-password';
  });

  afterEach(() => {
    delete process.env.TRANSMISSION_BASE_URL;
    delete process.env.TRANSMISSION_USERNAME;
    delete process.env.TRANSMISSION_PASSWORD;
  });

  it('uses legacy Transmission environment settings when stored values are empty', async () => {
    const client = await createTorrentClient({ id: 1 });

    expect(client).toMatchObject({ kind: 'transmission' });
    expect(clients.transmissionOptions).toEqual({
      baseUrl: 'http://transmission:9091',
      username: 'env-user',
      password: 'env-password',
    });
  });

  it('uses active torrent owner after configured client changes', async () => {
    settings = {
      ...settings,
      torrentClientType: 'qbittorrent',
      torrentClientUrl: 'http://qbittorrent:8080',
      torrentClientUsername: 'qb-user',
      torrentClientPassword: 'qb-password',
    };

    const client = await createTorrentClient({
      id: 1,
      torrentItem: createTorrentItem(),
    });

    expect(client).toMatchObject({ kind: 'transmission' });
    expect(clients.transmissionOptions?.baseUrl).toBe(
      'http://transmission:9091',
    );
    expect(clients.qbittorrentOptions).toBeNull();
  });
});

// Test fixtures

function createSettings(): DbUserSettings {
  return {
    id: 1,
    telegramId: null,
    botToken: null,
    downloadDir: null,
    mediaDir: null,
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
  };
}

function createTorrentItem(): DbTorrentItem {
  return {
    id: 1,
    trackerId: 'tracker-id',
    rawTitle: 'Raw title',
    title: 'Title',
    url: 'https://example.com/torrent',
    magnet: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789',
    season: null,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: null,
    files: null,
    createdAt: 1,
    updatedAt: 1,
    torrentClientId: '0123456789012345678901234567890123456789',
    torrentClientType: 'transmission',
    controlStatus: 'downloading',
    tracker: 'kinozal',
    errorMessage: null,
    notifyOnTitleChange: false,
    notifyOnMagnetChange: false,
    notifyOnDownloadComplete: false,
  };
}
