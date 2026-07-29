import type { NormalizedTorrent, TorrentState } from '@ctrl/shared-torrent';

export const torrentClientTypes = ['transmission', 'qbittorrent'] as const;
export type TorrentClientType = (typeof torrentClientTypes)[number];

export const torrentClientActions = [
  'pause',
  'resume',
  'verify',
  'reannounce',
  'queue-top',
  'queue-up',
  'queue-down',
  'queue-bottom',
] as const;

export type TorrentClientAction = (typeof torrentClientActions)[number];

export type TorrentClientItemDto = {
  id: string;
  name: string;
  progress: number;
  isCompleted: boolean;
  ratio: number;
  dateAdded: string;
  dateCompleted: string | null;
  savePath: string;
  label: string | null;
  tags: string[];
  state: TorrentState;
  stateMessage: string;
  uploadSpeed: number;
  downloadSpeed: number;
  eta: number;
  queuePosition: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  totalSeeds: number;
  totalPeers: number;
  totalSelected: number;
  totalSize: number;
  totalUploaded: number;
  totalDownloaded: number;
};

export interface TorrentClientPort {
  add(): Promise<void>;
  remove(withData?: boolean): Promise<void>;
  status(): Promise<NormalizedTorrent>;
  selectEpisodes(status: NormalizedTorrent): Promise<void>;
  getAllNormalized(): Promise<TorrentClientItemDto[]>;
  controlClientTorrent(id: string, action: TorrentClientAction): Promise<void>;
  removeClientTorrent(id: string, deleteData: boolean): Promise<number | null>;
}

export type TorrentClientConnection = {
  type: TorrentClientType;
  url: string;
  username: string;
  password: string;
};
