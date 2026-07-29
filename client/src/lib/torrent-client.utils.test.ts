import { describe, expect, it } from 'vitest';
import { TorrentState } from '@ctrl/shared-torrent';
import type { TorrentClientItemDto } from '@server/external/adapters/torrent-client';
import {
  filterTorrentClientTorrents,
  getAverageTransferSpeeds,
  formatBytes,
  formatPeerCount,
  formatTorrentEta,
  formatTransferSpeed,
  getTorrentProgress,
  getTorrentStateAppearance,
  getTorrentStateLabel,
  getTorrentTransferSummary,
  sumTransferSpeeds,
} from './torrent-client.utils';

describe('torrent client utilities', () => {
  it('filters by title and state', () => {
    const torrents = [
      createTorrent({ name: 'Ubuntu', state: TorrentState.downloading }),
      createTorrent({ name: 'Fedora', state: TorrentState.seeding }),
    ];

    expect(filterTorrentClientTorrents(torrents, 'ubu', 'all')).toHaveLength(1);
    expect(filterTorrentClientTorrents(torrents, '', 'seeding')).toEqual([
      torrents[1],
    ]);
  });

  it('filters active transfers by current speed', () => {
    const active = createTorrent({ downloadSpeed: 1024 });
    const idle = createTorrent({ id: 'idle' });

    expect(filterTorrentClientTorrents([active, idle], '', 'active')).toEqual([
      active,
    ]);
  });

  it('calculates average speeds since torrent was added', () => {
    const torrent = createTorrent({
      dateAdded: '2026-07-22T10:00:00.000Z',
      totalDownloaded: 7200,
      totalUploaded: 3600,
    });

    expect(
      getAverageTransferSpeeds(
        torrent,
        new Date('2026-07-22T11:00:00.000Z').getTime(),
      ),
    ).toEqual({ download: 2, upload: 1 });
  });

  it('sums upload and download speeds', () => {
    const result = sumTransferSpeeds([
      createTorrent({ downloadSpeed: 100, uploadSpeed: 25 }),
      createTorrent({ id: 'second', downloadSpeed: 50, uploadSpeed: 10 }),
    ]);

    expect(result).toEqual({ download: 150, upload: 35 });
  });

  it('formats transfer measurements', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatTransferSpeed(1024)).toBe('1.0 KB/s');
    expect(formatPeerCount(1)).toBe('1 peer');
    expect(formatPeerCount(3)).toBe('3 peers');
    expect(formatTorrentEta(3660)).toBe('1h 1m remaining');
    expect(formatTorrentEta(-1)).toBe('Unknown time remaining');
  });

  it('clamps progress and describes torrent state', () => {
    expect(getTorrentProgress(createTorrent({ progress: 1.5 }))).toBe(100);
    expect(
      getTorrentStateLabel(
        createTorrent({ state: TorrentState.seeding, ratio: 1.25 }),
      ),
    ).toBe('Seeding — Ratio 1.25');
  });

  it('formats Transmission-style transfer summaries', () => {
    expect(getTorrentTransferSummary(createTorrent())).toBe(
      '512 B of 1.0 KB (50%)',
    );
    expect(
      getTorrentTransferSummary(
        createTorrent({
          isCompleted: true,
          progress: 1,
          ratio: 1.43,
          totalUploaded: 2048,
        }),
      ),
    ).toBe('1.0 KB, uploaded 2.0 KB (ratio 1.43)');
  });

  it('maps transfer states to Transmission appearance tokens', () => {
    expect(getTorrentStateAppearance(TorrentState.downloading)).toEqual({
      titleClassName: 'text-transfer-downloading',
      indicatorClassName: 'bg-transfer-downloading',
    });
    expect(getTorrentStateAppearance(TorrentState.seeding)).toEqual({
      titleClassName: 'text-transfer-seeding',
      indicatorClassName: 'bg-transfer-seeding',
    });
    expect(getTorrentStateAppearance(TorrentState.error)).toEqual({
      titleClassName: 'text-transfer-error',
      indicatorClassName: 'bg-transfer-error',
    });
  });
});

function createTorrent(
  override: Partial<TorrentClientItemDto> = {},
): TorrentClientItemDto {
  return {
    id: 'hash',
    name: 'Ubuntu.iso',
    progress: 0.5,
    isCompleted: false,
    ratio: 0,
    dateAdded: '2026-06-27T00:00:00.000Z',
    dateCompleted: null,
    savePath: '/downloads',
    label: null,
    tags: [],
    state: TorrentState.paused,
    stateMessage: '',
    uploadSpeed: 0,
    downloadSpeed: 0,
    eta: 0,
    queuePosition: 0,
    peersSendingToUs: 0,
    peersGettingFromUs: 0,
    totalSeeds: 0,
    totalPeers: 0,
    totalSelected: 1024,
    totalSize: 1024,
    totalUploaded: 0,
    totalDownloaded: 512,
    ...override,
  };
}
