import type { trackersConf } from '@server/shared/trackers-conf';
import type { TrackerAuth } from './tracker-data.auth';

export type EpAndSeason = {
  season: number;
  startEp: number | null;
  endEp: number | null;
  totalEp: number | null;
};

export type TorrentDataResult = {
  torrentId: string;
  rawTitle: string;
  showTitle: string;
  epAndSeason: EpAndSeason | null;
  magnet: string;
};

export type TrackerAuthParams = {
  login: string;
  password: string;
  baseUrl: string;
  tracker: keyof typeof trackersConf;
};

export type TrackerDataParams = {
  url: string;
  tracker: keyof typeof trackersConf;
  trackerAuth?: TrackerAuth;
  timeout?: number;
};
