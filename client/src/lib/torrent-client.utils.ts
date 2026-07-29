import type { TorrentClientItemDto } from '@server/external/adapters/torrent-client';

export type TorrentListFilter =
  | 'all'
  | 'active'
  | 'downloading'
  | 'seeding'
  | 'paused';

export type TransferSpeeds = {
  download: number;
  upload: number;
};

export type TorrentStateAppearance = {
  titleClassName: string;
  indicatorClassName: string;
};

export function filterTorrentClientTorrents(
  torrents: TorrentClientItemDto[],
  search: string,
  filter: TorrentListFilter,
): TorrentClientItemDto[] {
  const normalizedSearch = search.trim().toLowerCase();

  return torrents.filter((torrent) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      torrent.name.toLowerCase().includes(normalizedSearch);
    if (!matchesSearch) return false;

    if (filter === 'all') return true;
    if (filter === 'active') {
      return torrent.downloadSpeed > 0 || torrent.uploadSpeed > 0;
    }
    return torrent.state === filter;
  });
}

export function getAverageTransferSpeeds(
  torrent: TorrentClientItemDto,
  now: number = Date.now(),
): TransferSpeeds {
  const addedAt = new Date(torrent.dateAdded).getTime();
  if (!Number.isFinite(addedAt) || addedAt >= now) {
    return { download: 0, upload: 0 };
  }

  const completedAt = torrent.dateCompleted
    ? new Date(torrent.dateCompleted).getTime()
    : now;
  const downloadEnd = Number.isFinite(completedAt) ? completedAt : now;

  return {
    download: getAverageSpeed(torrent.totalDownloaded, addedAt, downloadEnd),
    upload: getAverageSpeed(torrent.totalUploaded, addedAt, now),
  };
}

export function sumAverageTransferSpeeds(
  torrents: TorrentClientItemDto[],
  now: number = Date.now(),
): TransferSpeeds {
  return torrents.reduce<TransferSpeeds>((total, torrent) => {
    const average = getAverageTransferSpeeds(torrent, now);
    return {
      download: total.download + average.download,
      upload: total.upload + average.upload,
    };
  }, { download: 0, upload: 0 });
}

export function sumTransferSpeeds(
  torrents: TorrentClientItemDto[],
): TransferSpeeds {
  return torrents.reduce<TransferSpeeds>(
    (total, torrent) => ({
      download: total.download + torrent.downloadSpeed,
      upload: total.upload + torrent.uploadSpeed,
    }),
    { download: 0, upload: 0 },
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatTransferSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatPeerCount(count: number): string {
  return `${count} ${count === 1 ? 'peer' : 'peers'}`;
}

export function formatTorrentEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Unknown time remaining';
  if (seconds === 0) return 'Finishing';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return `${seconds}s remaining`;
}

export function getTorrentProgress(torrent: TorrentClientItemDto): number {
  return Math.min(100, Math.max(0, torrent.progress * 100));
}

export function getTorrentTransferSummary(
  torrent: TorrentClientItemDto,
): string {
  const selectedSize = torrent.totalSelected || torrent.totalSize;
  if (torrent.isCompleted || torrent.progress >= 1) {
    return `${formatBytes(selectedSize)}, uploaded ${formatBytes(torrent.totalUploaded)} (ratio ${torrent.ratio.toFixed(2)})`;
  }

  return `${formatBytes(torrent.totalDownloaded)} of ${formatBytes(selectedSize)} (${getTorrentProgress(torrent).toFixed(0)}%)`;
}

export function getTorrentStateLabel(torrent: TorrentClientItemDto): string {
  if (torrent.state === 'downloading') return formatTorrentEta(torrent.eta);
  if (torrent.state === 'seeding')
    return `Seeding — Ratio ${torrent.ratio.toFixed(2)}`;
  if (torrent.state === 'paused') return 'Paused';
  if (torrent.state === 'checking') return 'Verifying local data';
  if (torrent.state === 'queued') return 'Waiting in queue';
  if (torrent.state === 'error')
    return torrent.stateMessage || 'Transfer error';
  return torrent.stateMessage || 'Idle';
}

export function getTorrentStateAppearance(
  state: TorrentClientItemDto['state'],
): TorrentStateAppearance {
  if (state === 'downloading') {
    return createStateAppearance(
      'text-transfer-downloading',
      'bg-transfer-downloading',
    );
  }
  if (state === 'seeding') {
    return createStateAppearance(
      'text-transfer-seeding',
      'bg-transfer-seeding',
    );
  }
  if (state === 'paused') {
    return createStateAppearance('text-transfer-paused', 'bg-transfer-paused');
  }
  if (state === 'checking') {
    return createStateAppearance(
      'text-transfer-checking',
      'bg-transfer-checking',
    );
  }
  if (state === 'queued') {
    return createStateAppearance('text-transfer-queued', 'bg-transfer-queued');
  }
  if (state === 'error') {
    return createStateAppearance('text-transfer-error', 'bg-transfer-error');
  }
  if (state === 'warning') {
    return createStateAppearance(
      'text-transfer-warning',
      'bg-transfer-warning',
    );
  }
  return createStateAppearance('text-foreground', 'bg-muted-foreground');
}

// -----------------------------------------------------------------------------

function getAverageSpeed(
  totalBytes: number,
  startedAt: number,
  endedAt: number,
): number {
  const elapsedSeconds = Math.max(0, (endedAt - startedAt) / 1000);
  if (elapsedSeconds === 0 || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return 0;
  }
  return totalBytes / elapsedSeconds;
}

// -----------------------------------------------------------------------------
// State appearance helpers
// -----------------------------------------------------------------------------

function createStateAppearance(
  titleClassName: string,
  indicatorClassName: string,
): TorrentStateAppearance {
  return { titleClassName, indicatorClassName };
}
