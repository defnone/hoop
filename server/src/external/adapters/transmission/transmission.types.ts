import type { Transmission } from '@ctrl/transmission';
import type { TransmissionClientRepo } from './transmission.repo';
import type { DbTorrentItem } from '@server/db/app/app-schema';

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
