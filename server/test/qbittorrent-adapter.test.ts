import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TorrentFilePriority, type QBittorrent } from '@ctrl/qbittorrent';
import { TorrentState, type NormalizedTorrent } from '@ctrl/shared-torrent';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { QbittorrentAdapter } from '@server/external/adapters/qbittorrent';
import {
  extractTorrentHash,
  normalizeTorrentMagnet,
} from '@server/external/adapters/qbittorrent/qbittorrent.utils';

vi.mock('@server/external/adapters/torrent-client/torrent-client.repo', () => ({
  TorrentClientRepo: class {},
}));

const settings = {
  id: 1,
  downloadDir: '/downloads',
  torrentClientType: 'qbittorrent',
  torrentClientUrl: 'http://localhost:8080',
  torrentClientUsername: 'admin',
  torrentClientPassword: 'password',
} as DbUserSettings;

vi.mock('@server/features/settings/settings.service', () => ({
  SettingsService: class {
    async getSettings() {
      return settings;
    }
  },
}));

const torrentItem = {
  id: 1,
  magnet: 'magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567',
  torrentClientId: '0123456789abcdef0123456789abcdef01234567',
  trackedEpisodes: [2],
} as DbTorrentItem;

const status: NormalizedTorrent = {
  id: torrentItem.torrentClientId!,
  name: 'Show',
  progress: 50,
  isCompleted: false,
  ratio: 0,
  dateAdded: new Date().toISOString(),
  savePath: '/downloads',
  state: TorrentState.downloading,
  stateMessage: 'Downloading',
  uploadSpeed: 0,
  downloadSpeed: 10,
  eta: 10,
  queuePosition: 0,
  connectedSeeds: 0,
  connectedPeers: 0,
  totalSeeds: 0,
  totalPeers: 0,
  totalSelected: 0,
  totalSize: 0,
  totalUploaded: 0,
  totalDownloaded: 0,
  raw: {},
};

const addMagnet = vi.fn(async () => true);
const addTorrent = vi.fn(async () => true);
const getTorrent = vi.fn(async () => ({ ...status }));
const torrentFiles = vi.fn(async () => [
  { name: 'Show.S01E01.mkv', priority: TorrentFilePriority.NormalPriority },
  { name: 'Show.S01E02.mkv', priority: TorrentFilePriority.Skip },
]);
const setFilePriority = vi.fn(async () => true);
const pauseTorrent = vi.fn(async () => true);
const getAllData = vi.fn(async () => ({
  torrents: [
    {
      ...status,
      connectedSeeds: 8,
      connectedPeers: 0,
    },
  ],
  labels: [],
  raw: {},
}));

const client = {
  addMagnet,
  addTorrent,
  getAllData,
  getTorrent,
  torrentFiles,
  setFilePriority,
  pauseTorrent,
} as unknown as QBittorrent;

const updateTorrentItem = vi.fn(async () => torrentItem);
const repo = {
  findTorrentItemById: vi.fn(async () => torrentItem),
  findTorrentItemByTorrentClientId: vi.fn(async () => torrentItem),
  updateTorrentItem,
};

describe('QbittorrentAdapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds magnet and stores normalized hash', async () => {
    const adapter = createAdapter();
    await adapter.add();

    expect(addMagnet).toHaveBeenCalledWith(torrentItem.magnet, {
      savepath: '/downloads',
    });
    expect(updateTorrentItem).toHaveBeenCalledWith(1, {
      controlStatus: 'downloading',
      torrentClientId: torrentItem.torrentClientId,
      torrentClientType: 'qbittorrent',
    });
  });

  it('adds a torrent file with a custom download directory', async () => {
    const content = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>;
    const adapter = createAdapter();

    await adapter.addTorrent({
      source: 'file',
      content,
      filename: 'linux.torrent',
      downloadDir: '/custom-downloads',
    });

    expect(addTorrent).toHaveBeenCalledWith(content, {
      filename: 'linux.torrent',
      savepath: '/custom-downloads',
    });
  });

  it('adds a magnet with the configured download directory', async () => {
    const adapter = createAdapter();

    await adapter.addTorrent({
      source: 'magnet',
      magnet: torrentItem.magnet,
    });

    expect(addMagnet).toHaveBeenCalledWith(torrentItem.magnet, {
      savepath: '/downloads',
    });
  });

  it('converts a raw SHA-1 hash to a magnet before adding', async () => {
    const rawHashTorrentItem = {
      ...torrentItem,
      magnet: 'C2B13B2952C47D653A79CA5BD640784255A71885',
      torrentClientId: null,
    } as DbTorrentItem;
    const adapter = createAdapter(rawHashTorrentItem);

    await adapter.add();

    expect(addMagnet).toHaveBeenCalledWith(
      'magnet:?xt=urn:btih:C2B13B2952C47D653A79CA5BD640784255A71885',
      { savepath: '/downloads' },
    );
    expect(updateTorrentItem).toHaveBeenCalledWith(1, {
      controlStatus: 'downloading',
      torrentClientId: 'c2b13b2952c47d653a79ca5bd640784255a71885',
      torrentClientType: 'qbittorrent',
    });
  });

  it('loads files and excludes untracked episodes', async () => {
    const adapter = createAdapter();
    const loadedStatus = await adapter.status();
    await adapter.selectEpisodes(loadedStatus);

    expect(loadedStatus.raw.files).toHaveLength(2);
    expect(setFilePriority).toHaveBeenNthCalledWith(
      1,
      torrentItem.torrentClientId,
      ['1'],
      TorrentFilePriority.NormalPriority,
    );
    expect(setFilePriority).toHaveBeenNthCalledWith(
      2,
      torrentItem.torrentClientId,
      ['0'],
      TorrentFilePriority.Skip,
    );
  });

  it('selects numbered episodes without parsing numbers from parent folders', async () => {
    torrentFiles.mockResolvedValueOnce([
      {
        name: 'King of the Hill (1997-1998) - 02. Season/01. Episode one.mkv',
        priority: TorrentFilePriority.Skip,
      },
      {
        name: 'King of the Hill (1997-1998) - 02. Season/02. Episode two.mkv',
        priority: TorrentFilePriority.Skip,
      },
      {
        name: 'King of the Hill (1997-1998) - 02. Season/03. Episode three.mkv',
        priority: TorrentFilePriority.Skip,
      },
    ]);
    const adapter = createAdapter({
      ...torrentItem,
      trackedEpisodes: [2],
    } as DbTorrentItem);

    const loadedStatus = await adapter.status();
    await adapter.selectEpisodes(loadedStatus);

    expect(setFilePriority).toHaveBeenNthCalledWith(
      1,
      torrentItem.torrentClientId,
      ['1'],
      TorrentFilePriority.NormalPriority,
    );
    expect(setFilePriority).toHaveBeenNthCalledWith(
      2,
      torrentItem.torrentClientId,
      ['0', '2'],
      TorrentFilePriority.Skip,
    );
  });

  it('preserves custom priority for tracked episodes', async () => {
    torrentFiles.mockResolvedValueOnce([
      {
        name: 'Show.S01E02.mkv',
        priority: TorrentFilePriority.HighPriority,
      },
    ]);
    const adapter = createAdapter();

    const loadedStatus = await adapter.status();
    await adapter.selectEpisodes(loadedStatus);

    expect(setFilePriority).not.toHaveBeenCalled();
  });

  it('maps pause action', async () => {
    const adapter = createAdapter();
    await adapter.controlClientTorrent(torrentItem.torrentClientId!, 'pause');
    expect(pauseTorrent).toHaveBeenCalledWith(torrentItem.torrentClientId);
  });

  it('maps qBittorrent seeds as peers sending data to us', async () => {
    const adapter = createAdapter();

    const torrents = await adapter.getAllNormalized();

    expect(torrents[0]).toEqual(
      expect.objectContaining({
        peersSendingToUs: 8,
        peersGettingFromUs: 0,
      }),
    );
  });

  it.each([
    ['moving', TorrentState.checking],
    ['checkingUP', TorrentState.queued],
    ['checkingResumeData', TorrentState.checking],
  ])(
    'does not report a torrent as completed while qBittorrent is %s',
    async (rawState, normalizedState) => {
      getTorrent.mockResolvedValueOnce({
        ...status,
        progress: 1,
        isCompleted: true,
        state: normalizedState,
        raw: { state: rawState },
      } as NormalizedTorrent);

      const loadedStatus = await createAdapter().status();

      expect(loadedStatus.isCompleted).toBe(false);
    },
  );

  it('reports a completed torrent after qBittorrent enters seeding', async () => {
    getTorrent.mockResolvedValueOnce({
      ...status,
      progress: 1,
      isCompleted: true,
      state: TorrentState.seeding,
      raw: { state: 'uploading' },
    } as NormalizedTorrent);

    const loadedStatus = await createAdapter().status();

    expect(loadedStatus.isCompleted).toBe(true);
  });
});

describe('extractTorrentHash', () => {
  it('prefers btih for a hybrid magnet', () => {
    const magnet =
      'magnet:?xt=urn:btmh:1220AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567';

    expect(extractTorrentHash(magnet)).toBe(
      '0123456789abcdef0123456789abcdef01234567',
    );
  });

  it('extracts the digest from a SHA-256 multihash', () => {
    const digest = 'ABCDEF0123456789'.repeat(4);

    expect(extractTorrentHash(`magnet:?xt=urn:btmh:1220${digest}`)).toBe(
      digest.toLowerCase(),
    );
  });

  it('normalizes a base32 btih hash to hexadecimal', () => {
    expect(
      extractTorrentHash(
        'magnet:?xt=urn:btih:AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH',
      ),
    ).toBe('0123456789abcdef0123456789abcdef01234567');
  });

  it('rejects unsupported btmh multihashes', () => {
    expect(() =>
      extractTorrentHash(`magnet:?xt=urn:btmh:1114${'ab'.repeat(20)}`),
    ).toThrow('Magnet contains an unsupported btmh hash');
  });

  it('normalizes a raw SHA-1 hash to a magnet URL', () => {
    expect(
      normalizeTorrentMagnet(' C2B13B2952C47D653A79CA5BD640784255A71885 '),
    ).toBe('magnet:?xt=urn:btih:C2B13B2952C47D653A79CA5BD640784255A71885');
  });
});

function createAdapter(item: DbTorrentItem = torrentItem): QbittorrentAdapter {
  return new QbittorrentAdapter({
    id: item.id,
    torrentItem: item,
    client,
    repo: repo as never,
  });
}
