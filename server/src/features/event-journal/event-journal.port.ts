import type { DbTorrentItem } from '@server/db/app/app-schema';

export type TorrentUpdateEventParams = {
  torrentItem: DbTorrentItem;
  oldValue: string | null;
  newValue: string | null;
};

export type TorrentSyncFailedEventParams = {
  torrentItem: DbTorrentItem;
  errorMessage: string;
};

export type TorrentProcessEventParams = {
  torrentItem: DbTorrentItem;
  message?: string | null;
};

export type TorrentProcessFailedEventParams = {
  torrentItem: DbTorrentItem;
  errorMessage: string;
};

export interface EventJournalPort {
  recordTorrentTitleChanged(params: TorrentUpdateEventParams): Promise<void>;
  recordTorrentMagnetChanged(params: TorrentUpdateEventParams): Promise<void>;
  recordTorrentSyncFailed(params: TorrentSyncFailedEventParams): Promise<void>;
  recordTorrentDownloadStarted(
    params: TorrentProcessEventParams,
  ): Promise<void>;
  recordTorrentDownloadCompleted(
    params: TorrentProcessEventParams,
  ): Promise<void>;
  recordTorrentDownloadFailed(
    params: TorrentProcessFailedEventParams,
  ): Promise<void>;
  recordTorrentFileCopyStarted(
    params: TorrentProcessEventParams,
  ): Promise<void>;
  recordTorrentFileCopyCompleted(
    params: TorrentProcessEventParams,
  ): Promise<void>;
  recordTorrentFileCopyFailed(
    params: TorrentProcessFailedEventParams,
  ): Promise<void>;
}
