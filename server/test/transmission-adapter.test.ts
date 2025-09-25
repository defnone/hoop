import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Transmission } from '@ctrl/transmission';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';

// DB fixtures
const baseItem: DbTorrentItem = {
  id: 1,
  trackerId: 't1',
  rawTitle: 'raw',
  title: 'title',
  url: 'http://example.com',
  magnet: 'magnet:?xt=urn:btih:HASH',
  season: null,
  trackedEpisodes: [],
  haveEpisodes: [],
  totalEpisodes: null,
  files: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  transmissionId: null,
  controlStatus: 'idle',
  tracker: 'kinozal',
  errorMessage: null,
};

const baseSettings: DbUserSettings = {
  id: 1,
  telegramId: null,
  botToken: null,
  downloadDir: '/downloads',
  mediaDir: null,
  deleteAfterDownload: false,
  syncInterval: 30,
  jackettApiKey: null,
  jackettUrl: null,
  kinozalUsername: null,
  kinozalPassword: null,
};

let nextSettings: DbUserSettings = { ...baseSettings };
vi.mock('@server/features/settings/settings.service', () => {
  return {
    SettingsService: class {
      async getSettings() {
        return Promise.resolve({ ...nextSettings });
      }
    },
  };
});

// Repository mock
class RepoMock {
  public findTorrentItemById = vi.fn<
    [id: number],
    Promise<DbTorrentItem | null>
  >(() => Promise.resolve({ ...baseItem }));

  public updateTorrentItem = vi.fn<
    [id: number, data: Partial<DbTorrentItem>],
    Promise<DbTorrentItem | null>
  >((_id, data) => Promise.resolve({ ...baseItem, ...data } as DbTorrentItem));
}

// Transmission client mock
class TransmissionMock {
  public lastAddArgs: {
    magnet: string;
    options: Record<string, unknown>;
  } | null = null;
  public lastRemoveArgs: { id: string; deleteLocal: boolean } | null = null;

  async addMagnet(magnet: string, options: Record<string, unknown>) {
    this.lastAddArgs = { magnet, options };
    return Promise.resolve({
      arguments: { 'torrent-added': { hashString: 'abc123' } },
    });
  }

  async removeTorrent(id: string, deleteLocal: boolean) {
    this.lastRemoveArgs = { id, deleteLocal };
    return Promise.resolve({ id, deleteLocal });
  }

  async getTorrent(id: string) {
    return Promise.resolve({ id, name: 'some-torrent' });
  }

  async listTorrents() {
    return Promise.resolve({ arguments: { torrents: [{ hashString: 'x1' }] } });
  }
}

class TransmissionDuplicateMock extends TransmissionMock {
  override async addMagnet(magnet: string, options: Record<string, unknown>) {
    this.lastAddArgs = { magnet, options };
    return Promise.resolve({
      arguments: { 'torrent-duplicate': { hashString: 'dup123' } },
    });
  }
}

describe('TransmissionAdapter', () => {
  beforeEach(() => {
    // Satisfy env check in adapter constructor
    process.env.TRANSMISSION_BASE_URL =
      'http://localhost:9091/transmission/rpc';
    process.env.TRANSMISSION_USERNAME = 'user';
    process.env.TRANSMISSION_PASSWORD = 'pass';
    nextSettings = { ...baseSettings };
  });

  it('add(): adds torrent and updates item', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.add();

    // Verifies addMagnet is called with download-dir from settings
    expect(client.lastAddArgs).toBeTruthy();
    expect(client.lastAddArgs?.options['download-dir']).toBe('/downloads');

    // Verifies item update
    expect(repo.updateTorrentItem).toHaveBeenCalledTimes(1);
    const [idArg, dataArg] = repo.updateTorrentItem.mock.calls[0];
    expect(idArg).toBe(1);
    expect(dataArg).toMatchObject({
      controlStatus: 'downloading',
      transmissionId: 'abc123',
    });
  });

  it('add(): throws when torrent item not found', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    repo.findTorrentItemById.mockResolvedValueOnce(null);
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 999,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.add()).rejects.toThrow('Torrent item not found');
  });

  it('add(): handles duplicate and stores hashString', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionDuplicateMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.add();

    expect(repo.updateTorrentItem).toHaveBeenCalledTimes(1);
    const [, dataArg] = repo.updateTorrentItem.mock.calls[0];
    expect(dataArg).toMatchObject({
      transmissionId: 'dup123',
      controlStatus: 'downloading',
    });
  });

  it('remove(): removes torrent and clears linkage', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const withTransId: DbTorrentItem = {
      ...baseItem,
      transmissionId: 'abc123',
    };
    repo.findTorrentItemById.mockResolvedValueOnce(withTransId);
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.remove();

    expect(repo.updateTorrentItem).toHaveBeenCalledTimes(1);
    const [, dataArg] = repo.updateTorrentItem.mock.calls[0];
    expect(dataArg).toMatchObject({
      controlStatus: 'idle',
      transmissionId: null,
    });
    // deleteAfterDownload is false by default
    expect(client.lastRemoveArgs).toEqual({ id: 'abc123', deleteLocal: false });
  });

  it('remove(): throws when no transmissionId', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.remove()).rejects.toThrow('No transmissionId');
  });

  it('status(): returns status when transmissionId present', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const withTransId: DbTorrentItem = {
      ...baseItem,
      transmissionId: 'abc123',
    };
    repo.findTorrentItemById.mockResolvedValueOnce(withTransId);
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    const result = await adapter.status();
    expect(result).toMatchObject({ id: 'abc123', name: 'some-torrent' });
  });

  it('status(): throws when no transmissionId', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.status()).rejects.toThrow('No transmissionId');
  });

  it('getAll(): returns list of torrents', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    const list = await adapter.getAll();
    expect(list).toEqual([{ hashString: 'x1' }]);
  });

  it('add(): omits download-dir when not set in settings', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    // Настроим мок SettingsService на отсутствие downloadDir
    nextSettings = { ...baseSettings, downloadDir: null } as DbUserSettings;
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.add();
    expect(client.lastAddArgs).toBeTruthy();
    expect(
      'download-dir' in
        (client.lastAddArgs as NonNullable<typeof client.lastAddArgs>).options
    ).toBe(false);
  });

  it('add(): wraps errors from transmission client', async () => {
    class TransmissionErrorMock extends TransmissionMock {
      override async addMagnet() {
        throw new Error('boom');
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionErrorMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.add()).rejects.toThrow('Failed to add torrent: boom');
  });

  it('add(): throws when transmission returns no hashString', async () => {
    class TransmissionNoHashMock extends TransmissionMock {
      override async addMagnet(
        magnet: string,
        options: Record<string, unknown>
      ) {
        this.lastAddArgs = { magnet, options };
        return Promise.resolve({ arguments: {} });
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionNoHashMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.add()).rejects.toThrow(
      'Failed to add torrent: Transmission did not return hashString'
    );
  });

  it('remove(): forwards explicit delete flag to client', async () => {
    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const withTransId: DbTorrentItem = {
      ...baseItem,
      transmissionId: 'abc123',
    };
    repo.findTorrentItemById.mockResolvedValueOnce(withTransId);
    const client = new TransmissionMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.remove(true);
    expect(client.lastRemoveArgs).toEqual({ id: 'abc123', deleteLocal: true });
  });

  it('selectEpisodes(): unselects files not in trackedEpisodes', async () => {
    class TransmissionSelectMock extends TransmissionMock {
      public setCalls: Array<{ id: string; payload: Record<string, unknown> }> =
        [];
      override async getTorrent(_id: string) {
        return Promise.resolve({
          raw: {
            files: [
              { name: 'Show.S01E01.mkv' },
              { name: 'Show.S01E02.mkv' },
              { name: 'Show.S01E03.mkv' },
            ],
          },
        });
      }
      async setTorrent(id: string, payload: Record<string, unknown>) {
        this.setCalls.push({ id, payload });
        return Promise.resolve();
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    repo.findTorrentItemById.mockResolvedValueOnce({
      ...baseItem,
      transmissionId: 'abc123',
      trackedEpisodes: [1, 3],
    });
    const client = new TransmissionSelectMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.selectEpisodes();
    expect(client.setCalls).toHaveLength(1);
    expect(client.setCalls[0]).toEqual({
      id: 'abc123',
      payload: { 'files-unwanted': [1] }, // index 1 => E02 unselected
    });
  });

  it('selectEpisodes(): does nothing when all files are tracked', async () => {
    class TransmissionSelectNoopMock extends TransmissionMock {
      public setCalled = false;
      override async getTorrent(_id: string) {
        return Promise.resolve({ raw: { files: [{ name: 'S01E01' }] } });
      }
      async setTorrent() {
        this.setCalled = true;
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    repo.findTorrentItemById.mockResolvedValueOnce({
      ...baseItem,
      transmissionId: 'abc123',
      trackedEpisodes: [1],
    });
    const client = new TransmissionSelectNoopMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.selectEpisodes();
    expect(client.setCalled).toBe(false);
  });

  it('selectEpisodes(): throws when no transmissionId', async () => {
    class TransmissionSelectErrMock extends TransmissionMock {
      override async getTorrent(_id: string) {
        return Promise.resolve({ raw: { files: [{ name: 'S01E01' }] } });
      }
      async setTorrent() {
        return Promise.resolve();
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    // No transmissionId in item
    repo.findTorrentItemById.mockResolvedValueOnce({ ...baseItem });
    const client = new TransmissionSelectErrMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await expect(adapter.selectEpisodes()).rejects.toThrow('No transmissionId');
  });

  it('constructor: throws when required env vars are missing', async () => {
    vi.resetModules();
    const old = {
      url: process.env.TRANSMISSION_BASE_URL,
      user: process.env.TRANSMISSION_USERNAME,
      pass: process.env.TRANSMISSION_PASSWORD,
    };
    delete process.env.TRANSMISSION_BASE_URL;
    delete process.env.TRANSMISSION_USERNAME;
    delete process.env.TRANSMISSION_PASSWORD;

    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    const client = new TransmissionMock();

    expect(
      () =>
        new TransmissionAdapter({
          id: 1,
          client: client as unknown as Transmission,
          repo: repo as unknown as never,
        })
    ).toThrow(
      'TRANSMISSION_BASE_URL, TRANSMISSION_USERNAME, TRANSMISSION_PASSWORD must be set in env'
    );

    // Restore envs for subsequent tests
    process.env.TRANSMISSION_BASE_URL = old.url;
    process.env.TRANSMISSION_USERNAME = old.user;
    process.env.TRANSMISSION_PASSWORD = old.pass;
  });

  it('selectEpisodes(): supports alternative episode patterns (E12 and pure numbers)', async () => {
    class TransmissionSelectAltMock extends TransmissionMock {
      public setCalls: Array<{ id: string; payload: Record<string, unknown> }> =
        [];
      override async getTorrent(_id: string) {
        return Promise.resolve({
          raw: {
            files: [
              { name: 'Show.E02.mkv' }, // matches /[Ee](\d+)/
              { name: 'Show.12.mkv' }, // matches /(?<![\w\d])(\d{2,3})(?![\d])/
              { name: 'Other.007.extra.mkv' }, // should match 007 but 7 not tracked
            ],
          },
        });
      }
      async setTorrent(id: string, payload: Record<string, unknown>) {
        this.setCalls.push({ id, payload });
        return Promise.resolve();
      }
    }

    vi.resetModules();
    vi.mock('@server/external/adapters/transmission/transmission.repo', () => {
      return { TransmissionClientRepo: class {} };
    });
    const { TransmissionAdapter } = await import(
      '@server/external/adapters/transmission'
    );

    const repo = new RepoMock();
    repo.findTorrentItemById.mockResolvedValueOnce({
      ...baseItem,
      transmissionId: 'abc123',
      trackedEpisodes: [2, 12],
    });
    const client = new TransmissionSelectAltMock();

    const adapter = new TransmissionAdapter({
      id: 1,
      client: client as unknown as Transmission,
      repo: repo as unknown as never,
    });

    await adapter.selectEpisodes();
    // Only the 007 (episode 7) should be unselected => index 2
    expect(client.setCalls).toHaveLength(1);
    expect(client.setCalls[0]).toEqual({
      id: 'abc123',
      payload: { 'files-unwanted': [2] },
    });
  });
});
