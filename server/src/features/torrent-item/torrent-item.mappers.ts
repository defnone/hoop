import type { DbTorrentItem } from '@server/db/app/app-schema';
import type { TorrentItemDto } from './torrent-item.types';

export function toTorrentItemDto(row: DbTorrentItem): TorrentItemDto {
  return {
    id: row.id,
    trackerId: row.trackerId,
    tracker: row.tracker,
    title: row.title,
    season: row.season,
    rawTitle: row.rawTitle,
    url: row.url,
    files: (row.files as string[]) ?? [],
    magnet: row.magnet,
    controlStatus: row.controlStatus,
    haveEpisodes: row.haveEpisodes as number[],
    totalEpisodes: row.totalEpisodes,
    trackedEpisodes: (row.trackedEpisodes as number[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    errorMessage: row.errorMessage,
  };
}

export function toTorrentItemsDto(rows: DbTorrentItem[]): TorrentItemDto[] {
  return rows.map((row) => toTorrentItemDto(row));
}
