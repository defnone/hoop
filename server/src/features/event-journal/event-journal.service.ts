import { EventJournalRepo } from './event-journal.repo';
import { toEventJournalDto, toEventJournalDtos } from './event-journal.mappers';
import type {
  EventJournalDto,
  EventJournalPageDto,
} from './event-journal.types';
import type {
  EventJournalPort,
  TorrentProcessEventParams,
  TorrentProcessFailedEventParams,
  TorrentSyncFailedEventParams,
  TorrentUpdateEventParams,
  TransmissionUnavailableEventParams,
} from './event-journal.port';

export class EventJournalService implements EventJournalPort {
  private readonly repo: EventJournalRepo;

  constructor(repo = new EventJournalRepo()) {
    this.repo = repo;
  }

  async getAll(page: number, limit: number): Promise<EventJournalPageDto> {
    const rows = await this.repo.findAll(page, limit);
    return {
      items: toEventJournalDtos(rows.items),
      total: rows.total,
      page,
      hasNext: rows.total > page * limit,
    };
  }

  async markAsRead(id: number): Promise<EventJournalDto | null> {
    const row = await this.repo.markAsRead(id);
    return row ? toEventJournalDto(row) : null;
  }

  async markAllAsRead(): Promise<EventJournalDto[]> {
    const rows = await this.repo.markAllAsRead();
    return toEventJournalDtos(rows);
  }

  async recordTorrentTitleChanged(
    params: TorrentUpdateEventParams,
  ): Promise<void> {
    await this.createTorrentUpdateEvent({
      type: 'torrentTitleChanged',
      state: 'info',
      params,
      isNotification: true,
    });
  }

  async recordTorrentMagnetChanged(
    params: TorrentUpdateEventParams,
  ): Promise<void> {
    await this.createTorrentUpdateEvent({
      type: 'torrentMagnetChanged',
      state: 'info',
      params,
      isNotification: false,
    });
  }

  async recordTorrentSyncFailed(
    params: TorrentSyncFailedEventParams,
  ): Promise<void> {
    await this.repo.create({
      type: 'torrentSyncFailed',
      state: 'error',
      torrentItemId: params.torrentItem.id,
      torrentTitle: params.torrentItem.title,
      oldValue: null,
      newValue: params.errorMessage,
      isNotification: true,
    });
  }

  async recordTorrentDownloadStarted(
    params: TorrentProcessEventParams,
  ): Promise<void> {
    await this.createTorrentProcessEvent({
      type: 'torrentDownloadStarted',
      state: 'info',
      params,
      isNotification: true,
    });
  }

  async recordTorrentDownloadCompleted(
    params: TorrentProcessEventParams,
  ): Promise<void> {
    await this.createTorrentProcessEvent({
      type: 'torrentDownloadCompleted',
      state: 'info',
      params,
      isNotification: true,
    });
  }

  async recordTorrentDownloadFailed(
    params: TorrentProcessFailedEventParams,
  ): Promise<void> {
    await this.createTorrentProcessFailedEvent({
      type: 'torrentDownloadFailed',
      params,
      isNotification: true,
    });
  }

  async recordTorrentFileCopyStarted(
    params: TorrentProcessEventParams,
  ): Promise<void> {
    await this.createTorrentProcessEvent({
      type: 'torrentFileCopyStarted',
      state: 'info',
      params,
      isNotification: false,
    });
  }

  async recordTorrentFileCopyCompleted(
    params: TorrentProcessEventParams,
  ): Promise<void> {
    await this.createTorrentProcessEvent({
      type: 'torrentFileCopyCompleted',
      state: 'info',
      params,
      isNotification: false,
    });
  }

  async recordTorrentFileCopyFailed(
    params: TorrentProcessFailedEventParams,
  ): Promise<void> {
    await this.createTorrentProcessFailedEvent({
      type: 'torrentFileCopyFailed',
      params,
      isNotification: false,
    });
  }

  async recordTransmissionUnavailable(
    params: TransmissionUnavailableEventParams,
  ): Promise<void> {
    await this.repo.create({
      type: 'transmissionUnavailable',
      state: 'error',
      torrentItemId: null,
      torrentTitle: 'Transmission',
      oldValue: null,
      newValue: params.errorMessage,
      isNotification: true,
    });
  }

  private async createTorrentUpdateEvent({
    type,
    state,
    params,
    isNotification,
  }: {
    type: 'torrentTitleChanged' | 'torrentMagnetChanged';
    state: 'info' | 'error';
    params: TorrentUpdateEventParams;
    isNotification: boolean;
  }): Promise<void> {
    await this.repo.create({
      type,
      state,
      torrentItemId: params.torrentItem.id,
      torrentTitle: params.torrentItem.title,
      oldValue: params.oldValue,
      newValue: params.newValue,
      isNotification,
    });
  }

  private async createTorrentProcessEvent({
    type,
    state,
    params,
    isNotification,
  }: {
    type:
      | 'torrentDownloadStarted'
      | 'torrentDownloadCompleted'
      | 'torrentFileCopyStarted'
      | 'torrentFileCopyCompleted';
    state: 'info';
    params: TorrentProcessEventParams;
    isNotification: boolean;
  }): Promise<void> {
    await this.repo.create({
      type,
      state,
      torrentItemId: params.torrentItem.id,
      torrentTitle: params.torrentItem.title,
      oldValue: null,
      newValue: params.message ?? null,
      isNotification,
    });
  }

  private async createTorrentProcessFailedEvent({
    type,
    params,
    isNotification,
  }: {
    type: 'torrentDownloadFailed' | 'torrentFileCopyFailed';
    params: TorrentProcessFailedEventParams;
    isNotification: boolean;
  }): Promise<void> {
    await this.repo.create({
      type,
      state: 'error',
      torrentItemId: params.torrentItem.id,
      torrentTitle: params.torrentItem.title,
      oldValue: null,
      newValue: params.errorMessage,
      isNotification,
    });
  }
}
