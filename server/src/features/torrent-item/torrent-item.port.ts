import type { TorrentDataResult } from '@server/external/adapters/tracker-data';
import type { PagedResult, TorrentItemDto } from './torrent-item.types';
import type { DbTorrentItem } from '@server/db/app/app-schema';

export interface TorrentItemPort {
  trackerData: TorrentDataResult | null;
  databaseData: DbTorrentItem | null;

  fetchData(): Promise<void>;

  getAll(page: number, limit: number): Promise<PagedResult<TorrentItemDto>>;

  getById(): Promise<TorrentItemDto>;

  addOrUpdate(): Promise<TorrentItemDto | null>;

  markAsDownloadRequested(): Promise<void>;

  updateTrackedEpisodes(episodes: number[]): Promise<void>;

  setAllEpisodesTracked(): Promise<void>;

  delete(withFiles?: boolean): Promise<void>;

  markAsPaused(): Promise<void>;

  markAsIdle(): Promise<void>;

  deleteFileEpisode(filePath: string): Promise<void>;
}
