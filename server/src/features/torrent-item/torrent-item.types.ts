import type { TrackerDataAdapter } from '@server/external/adapters/tracker-data';
import type { TorrentItemRepo } from './torrent-item.repo';
import type { controlStatuses } from '@server/db/app/app-schema';

export type TorrentItemDto = {
  id: number;
  trackerId: string;
  tracker: string;
  title: string;
  rawTitle: string;
  url: string;
  files: string[];
  season: number | null;
  haveEpisodes: number[];
  totalEpisodes: number | null;
  trackedEpisodes: number[];
  magnet: string | null;
  errorMessage: string | null;
  controlStatus: (typeof controlStatuses)[number];
  createdAt: number;
  updatedAt: number;
};

export type TorrentItem = {
  trackerId?: string;
  repo?: TorrentItemRepo;
  trackerDataAdapter?: TrackerDataAdapter;
};

export type TorrentItemWithID = TorrentItem & {
  id: number;
  url?: undefined;
};

export type TorrentItemWithUrl = TorrentItem & {
  id?: undefined;
  url: string;
};

/**
 * Both `id` and `url` provided.
 * Useful when you already know the DB id but also want to (re)hydrate/verify via URL.
 */
export type TorrentItemWithBoth = TorrentItem & {
  id: number;
  url: string;
};

/**
 * Accepts: by `url`, by `id`, or both (`id` + `url`).
 */
export type TorrentItemParams =
  | TorrentItemWithUrl
  | TorrentItemWithID
  | TorrentItemWithBoth;

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  hasNext: boolean;
};
