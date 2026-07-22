import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TorrentFilePriority, type QBittorrent } from '@ctrl/qbittorrent';
import { TorrentState, type NormalizedTorrent } from '@ctrl/shared-torrent';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { QbittorrentAdapter } from '@server/external/adapters/qbittorrent';
import { extractTorrentHash } from '@server/external/adapters/qbittorrent/qbittorrent.utils';

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

const status = {
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
} satisfies NormalizedTorrent;

const addMagnet = vi.fn(async () => true);
const getTorrent = vi.fn(async () => ({ ...status }));
const torrentFiles = vi.fn(async () => [
  { name: 'Show.S01E01.mkv' },
  { name: 'Show.S01E02.mkv' },
]);
const setFilePriority = vi.fn(async () => true);
const pauseTorrent = vi.fn(async () => true);

const client = {
  addMagnet,
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

  it('loads files and excludes untracked episodes', async () => {
    const adapter = createAdapter();
    const loadedStatus = await adapter.status();
    await adapter.selectEpisodes(loadedStatus);

    expect(loadedStatus.raw.files).toHaveLength(2);
    expect(setFilePriority).toHaveBeenCalledWith(
      torrentItem.torrentClientId,
      ['0'],
      TorrentFilePriority.Skip,
    );
  });

  it('maps pause action', async () => {
    const adapter = createAdapter();
    await adapter.controlClientTorrent(torrentItem.torrentClientId!, 'pause');
    expect(pauseTorrent).toHaveBeenCalledWith(torrentItem.torrentClientId);
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
});

function createAdapter(): QbittorrentAdapter {
  return new QbittorrentAdapter({
    id: torrentItem.id,
    torrentItem,
    client,
    repo: repo as never,
  });
}
