import type { Transmission } from '@ctrl/transmission';
import type { TransmissionClientRepo } from './transmission.repo';
import type { DbTorrentItem } from '@server/db/app/app-schema';
import type { TorrentState } from '@ctrl/shared-torrent';

export type TransmissionItemParams = {
  id: number;
  client?: Transmission;
  repo?: TransmissionClientRepo;
  torrentItem?: DbTorrentItem;
};

export type AddMagnetResult = {
  arguments: {
    'torrent-added'?: { hashString: string };
    'torrent-duplicate'?: { hashString: string };
  };
};

export type EpisodeSelectionStatus = {
  raw: {
    files: Array<{ name: string }>;
  };
};

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
  /** Peers currently sending data to this client. */
  peersSendingToUs: number;
  /** Peers currently receiving data from this client. */
  peersGettingFromUs: number;
  totalSeeds: number;
  totalPeers: number;
  totalSelected: number;
  totalSize: number;
  totalUploaded: number;
  totalDownloaded: number;
};
