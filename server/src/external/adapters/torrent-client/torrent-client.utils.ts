import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import type { TorrentClientItemDto } from './torrent-client.types';

export function toTorrentClientItemDto(
  torrent: NormalizedTorrent,
): TorrentClientItemDto {
  return {
    id: torrent.id,
    name: torrent.name,
    progress: torrent.progress,
    isCompleted: torrent.isCompleted,
    ratio: torrent.ratio,
    dateAdded: torrent.dateAdded,
    dateCompleted: torrent.dateCompleted ?? null,
    savePath: torrent.savePath,
    label: torrent.label ?? null,
    tags: torrent.tags ?? [],
    state: torrent.state,
    stateMessage: torrent.stateMessage,
    uploadSpeed: torrent.uploadSpeed,
    downloadSpeed: torrent.downloadSpeed,
    eta: torrent.eta,
    queuePosition: torrent.queuePosition,
    peersSendingToUs: torrent.connectedPeers,
    peersGettingFromUs: torrent.connectedSeeds,
    totalSeeds: torrent.totalSeeds,
    totalPeers: torrent.totalPeers,
    totalSelected: torrent.totalSelected,
    totalSize: torrent.totalSize,
    totalUploaded: torrent.totalUploaded,
    totalDownloaded: torrent.totalDownloaded,
  };
}
