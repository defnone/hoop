import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@server/db', () => ({ default: {} as never }));

import { EventJournalService } from '@server/features/event-journal/event-journal.service';
import type {
  DbEventJournal,
  DbEventJournalInsert,
  DbTorrentItem,
} from '@server/db/app/app-schema';

class RepoMock {
  public created: DbEventJournalInsert[] = [];

  async findAll(): Promise<{ items: DbEventJournal[]; total: number }> {
    return { items: [], total: 0 };
  }

  async markAsRead(): Promise<DbEventJournal | undefined> {
    return undefined;
  }

  async markAllAsRead(): Promise<DbEventJournal[]> {
    return [];
  }

  async deleteAll(): Promise<DbEventJournal[]> {
    return [];
  }

  async create(
    data: DbEventJournalInsert,
  ): Promise<DbEventJournal | undefined> {
    this.created.push(data);
    return undefined;
  }
}

const torrentItem: DbTorrentItem = {
  id: 1,
  trackerId: 't-1',
  rawTitle: 'Old Raw',
  title: 'Some Show',
  url: 'https://example.com/t?id=1',
  magnet: 'magnet:?xt=urn:btih:old',
  season: 1,
  trackedEpisodes: [],
  haveEpisodes: [],
  totalEpisodes: 10,
  files: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  transmissionId: null,
  controlStatus: 'idle',
  tracker: 'kinozal',
  errorMessage: null,
  notifyOnTitleChange: false,
  notifyOnMagnetChange: false,
  notifyOnDownloadComplete: true,
};

describe('EventJournalService', () => {
  let repo: RepoMock;
  let service: EventJournalService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new RepoMock();
    service = new EventJournalService(repo as never);
  });

  it('creates title change event as notification', async () => {
    await service.recordTorrentTitleChanged({
      torrentItem,
      oldValue: 'Old Raw',
      newValue: 'New Raw',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentTitleChanged',
      state: 'info',
      isNotification: true,
    });
  });

  it('creates magnet change event without notification flag', async () => {
    await service.recordTorrentMagnetChanged({
      torrentItem,
      oldValue: 'old-magnet',
      newValue: 'new-magnet',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentMagnetChanged',
      state: 'info',
      isNotification: false,
    });
  });

  it('creates sync failed event as error notification', async () => {
    await service.recordTorrentSyncFailed({
      torrentItem,
      errorMessage: 'UpdateWorker: Error on fetch data, failed',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentSyncFailed',
      state: 'error',
      oldValue: null,
      newValue: 'UpdateWorker: Error on fetch data, failed',
      isNotification: true,
    });
  });

  it('creates download started event as notification', async () => {
    await service.recordTorrentDownloadStarted({
      torrentItem,
      message: 'Download started',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentDownloadStarted',
      state: 'info',
      oldValue: null,
      newValue: 'Download started',
      isNotification: true,
    });
  });

  it('creates download completed event as notification', async () => {
    await service.recordTorrentDownloadCompleted({
      torrentItem,
      message: 'Download completed',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentDownloadCompleted',
      state: 'info',
      oldValue: null,
      newValue: 'Download completed',
      isNotification: true,
    });
  });

  it('creates download failed event as error notification', async () => {
    await service.recordTorrentDownloadFailed({
      torrentItem,
      errorMessage: 'DownloadWorker: Failed to start downloading, failed',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'torrentDownloadFailed',
      state: 'error',
      oldValue: null,
      newValue: 'DownloadWorker: Failed to start downloading, failed',
      isNotification: true,
    });
  });

  it('creates file copy events without notification flag', async () => {
    await service.recordTorrentFileCopyStarted({
      torrentItem,
      message: 'File copy started',
    });
    await service.recordTorrentFileCopyCompleted({
      torrentItem,
      message: 'Copied 2 file(s)',
    });
    await service.recordTorrentFileCopyFailed({
      torrentItem,
      errorMessage:
        'DownloadWorker: Error processing completed download, failed',
    });

    expect(repo.created).toEqual([
      expect.objectContaining({
        type: 'torrentFileCopyStarted',
        state: 'info',
        isNotification: false,
      }),
      expect.objectContaining({
        type: 'torrentFileCopyCompleted',
        state: 'info',
        isNotification: false,
      }),
      expect.objectContaining({
        type: 'torrentFileCopyFailed',
        state: 'error',
        isNotification: false,
      }),
    ]);
  });

  it('creates a general Transmission unavailable notification', async () => {
    await service.recordTransmissionUnavailable({
      errorMessage: 'Transmission request failed without an HTTP response',
    });

    expect(repo.created[0]).toMatchObject({
      type: 'transmissionUnavailable',
      state: 'error',
      torrentItemId: null,
      torrentTitle: 'Transmission',
      oldValue: null,
      newValue: 'Transmission request failed without an HTTP response',
      isNotification: true,
    });
  });
});
