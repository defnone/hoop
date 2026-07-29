import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transmission } from '@ctrl/transmission';
import { TorrentState, type NormalizedTorrent } from '@ctrl/shared-torrent';
import type { DbTorrentItem } from '@server/db/app/app-schema';
import type { TransmissionClientRepo } from '@server/external/adapters/transmission/transmission.repo';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import type { TorrentClientAction } from '@server/external/adapters/transmission';

vi.mock('@server/external/adapters/transmission/transmission.repo', () => ({
  TransmissionClientRepo: class TransmissionClientRepoMock {},
}));

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class SettingsServiceMock {},
}));

class TransmissionManagementMock {
  public getAllData = vi.fn(async () => ({
    torrents: [createNormalizedTorrent()],
    labels: [],
    raw: {},
  }));

  public pauseTorrent = vi.fn(async (_id: string) => ({}));
  public resumeTorrent = vi.fn(async (_id: string) => ({}));
  public verifyTorrent = vi.fn(async (_id: string) => ({}));
  public reannounceTorrent = vi.fn(async (_id: string) => ({}));
  public queueTop = vi.fn(async (_id: string) => ({}));
  public queueUp = vi.fn(async (_id: string) => ({}));
  public queueDown = vi.fn(async (_id: string) => ({}));
  public queueBottom = vi.fn(async (_id: string) => ({}));
  public removeTorrent = vi.fn(
    async (_id: string, _deleteData: boolean) => ({}),
  );
}

class TransmissionManagementRepoMock {
  public findTorrentItemByTorrentClientId = vi.fn(
    async (_torrentClientId: string): Promise<DbTorrentItem | null> => null,
  );

  public updateTorrentItem = vi.fn(
    async (
      _id: number,
      _data: Partial<DbTorrentItem>,
    ): Promise<DbTorrentItem | null> => null,
  );
}

beforeEach(() => {
  process.env.TRANSMISSION_BASE_URL = 'http://localhost:9091/transmission/rpc';
  process.env.TRANSMISSION_USERNAME = 'user';
  process.env.TRANSMISSION_PASSWORD = 'pass';
});

describe('TransmissionAdapter management methods', () => {
  it('returns normalized client data without raw payloads', async () => {
    const { adapter } = createAdapter();

    const torrents = await adapter.getAllNormalized();

    expect(torrents).toEqual([
      expect.objectContaining({
        id: 'hash',
        name: 'Ubuntu.iso',
        dateCompleted: null,
        label: null,
        tags: [],
        peersSendingToUs: 2,
        peersGettingFromUs: 1,
      }),
    ]);
    expect(torrents[0]).not.toHaveProperty('raw');
  });

  it.each<{
    action: TorrentClientAction;
    method: keyof TransmissionManagementMock;
  }>([
    { action: 'pause', method: 'pauseTorrent' },
    { action: 'resume', method: 'resumeTorrent' },
    { action: 'verify', method: 'verifyTorrent' },
    { action: 'reannounce', method: 'reannounceTorrent' },
    { action: 'queue-top', method: 'queueTop' },
    { action: 'queue-up', method: 'queueUp' },
    { action: 'queue-down', method: 'queueDown' },
    { action: 'queue-bottom', method: 'queueBottom' },
  ])('runs the $action client action', async ({ action, method }) => {
    const { adapter, client } = createAdapter();

    await adapter.controlClientTorrent('hash', action);

    expect(client[method]).toHaveBeenCalledWith('hash');
  });

  it('removes an unmanaged torrent without updating hoop state', async () => {
    const { adapter, client, repo } = createAdapter();

    const torrentItemId = await adapter.removeClientTorrent('hash', false);

    expect(client.removeTorrent).toHaveBeenCalledWith('hash', false);
    expect(torrentItemId).toBeNull();
    expect(repo.updateTorrentItem).not.toHaveBeenCalled();
  });

  it('removes a managed torrent and resets its hoop state', async () => {
    const { adapter, client, repo } = createAdapter();
    repo.findTorrentItemByTorrentClientId.mockResolvedValueOnce(
      createDatabaseTorrent(),
    );

    const torrentItemId = await adapter.removeClientTorrent('hash', true);

    expect(client.removeTorrent).toHaveBeenCalledWith('hash', true);
    expect(repo.updateTorrentItem).toHaveBeenCalledWith(7, {
      controlStatus: 'idle',
      torrentClientId: null,
    });
    expect(torrentItemId).toBe(7);
  });
});

function createAdapter(): {
  adapter: TransmissionAdapter;
  client: TransmissionManagementMock;
  repo: TransmissionManagementRepoMock;
} {
  const client = new TransmissionManagementMock();
  const repo = new TransmissionManagementRepoMock();
  const adapter = new TransmissionAdapter({
    id: 0,
    client: client as never as Transmission,
    repo: repo as never as TransmissionClientRepo,
  });
  return { adapter, client, repo };
}

function createNormalizedTorrent(): NormalizedTorrent {
  return {
    id: 'hash',
    name: 'Ubuntu.iso',
    progress: 0.5,
    isCompleted: false,
    ratio: 0,
    dateAdded: '2026-06-27T00:00:00.000Z',
    savePath: '/downloads',
    state: TorrentState.downloading,
    stateMessage: 'Downloading',
    uploadSpeed: 0,
    downloadSpeed: 1024,
    eta: 60,
    queuePosition: 0,
    connectedSeeds: 1,
    connectedPeers: 2,
    totalSeeds: 3,
    totalPeers: 4,
    totalSelected: 1024,
    totalSize: 1024,
    totalUploaded: 0,
    totalDownloaded: 512,
    raw: { files: [] },
  };
}

function createDatabaseTorrent(): DbTorrentItem {
  return {
    id: 7,
    trackerId: 'tracker-id',
    tracker: 'tracker',
    rawTitle: 'Ubuntu.iso',
    title: 'Ubuntu',
    url: 'https://example.com/torrent',
    magnet: 'magnet:?xt=urn:btih:hash',
    season: null,
    trackedEpisodes: [],
    haveEpisodes: [],
    totalEpisodes: null,
    files: [],
    torrentClientId: 'hash',
    torrentClientType: 'transmission',
    controlStatus: 'downloading',
    errorMessage: null,
    notifyOnTitleChange: false,
    notifyOnMagnetChange: false,
    notifyOnDownloadComplete: true,
    createdAt: 1,
    updatedAt: 1,
  };
}
