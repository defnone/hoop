import {
  TrackerDataAdapter,
  type TorrentDataResult,
} from '@server/external/adapters/tracker-data';
import { TorrentItemRepo } from './torrent-item.repo';
import { detectTracker, makeRange } from './torrent-item.utils';
import type {
  DbTorrentItem,
  DbTorrentItemInsert,
} from '@server/db/app/app-schema';
import { toTorrentItemDto, toTorrentItemsDto } from './torrent-item.mappers';
import type { TorrentItemPort } from './torrent-item.port';
import type { TorrentItemParams } from './torrent-item.types';
import { FileManagementService } from '../file-management/file-management.service';

export class TorrentItem implements TorrentItemPort {
  id?: number;
  trackerId?: string;
  tracker?: string;
  url?: string;
  trackerData: TorrentDataResult | null = null;
  databaseData: DbTorrentItem | null = null;

  private repo: TorrentItemRepo;

  constructor({
    url,
    id,
    trackerId,
    repo = new TorrentItemRepo(),
  }: TorrentItemParams) {
    this.url = url;
    this.trackerId = trackerId;
    this.repo = repo;
    this.id = id;

    if (url) this.tracker = detectTracker(url);
  }

  async fetchData() {
    if (!this.url) throw new Error('Url not found');
    if (!this.tracker) throw new Error('Tracker not found');
    const trackerData = await new TrackerDataAdapter({
      url: this.url,
      tracker: this.tracker,
    }).collect();
    this.trackerData = trackerData;
    this.trackerId = trackerData.torrentId;
  }

  async getAll(page: number, limit: number) {
    const rows = await this.repo.findAll(page, limit);
    const result = {
      items: toTorrentItemsDto(rows.items),
      total: rows.total,
      page,
      hasNext: rows.total > page * limit,
    };
    return result;
  }

  async getById() {
    if (!this.id) throw new Error('ID is not defined');
    const row = await this.repo.findById(this.id);
    if (!row) throw new Error('Database item not found');
    this.databaseData = row;
    return toTorrentItemDto(row);
  }

  async addOrUpdate() {
    if (!this.url) throw new Error('Url not found');
    await this.fetchData();
    if (!this.trackerData)
      throw new Error(
        'Tracker data not found, are you fetching the data first?'
      );
    if (!this.tracker) throw new Error('Tracker not found');
    if (!this.trackerId) throw new Error('Torrent ID not found');

    const insertData: DbTorrentItemInsert = {
      trackerId: this.trackerId,
      rawTitle: this.trackerData.rawTitle,
      title: this.trackerData.showTitle,
      url: this.url,
      magnet: this.trackerData.magnet,
      season: this.trackerData.epAndSeason?.season,
      haveEpisodes:
        this.trackerData.epAndSeason &&
        typeof this.trackerData.epAndSeason.startEp === 'number' &&
        typeof this.trackerData.epAndSeason.endEp === 'number'
          ? makeRange(
              this.trackerData.epAndSeason.startEp,
              this.trackerData.epAndSeason.endEp
            )
          : [],
      totalEpisodes: this.trackerData.epAndSeason?.totalEp,
      tracker: this.tracker,
    };
    const row = await this.repo.upsert(insertData);
    this.databaseData = row ?? null;
    this.id = row?.id;
    return row ? toTorrentItemDto(row) : null;
  }

  async delete(withFiles: boolean = false) {
    if (!this.id) throw new Error('ID is not defined');
    if (withFiles) {
      await this.getById();
      for (const file of this.databaseData?.files as string[]) {
        await new FileManagementService().deleteFile(file);
      }
    }
    await this.repo.deleteById(this.id);
  }

  async markAsDownloadRequested() {
    if (!this.databaseData)
      throw new Error('No database data on markAsDownloadRequested');
    const row = await this.repo.update(this.databaseData.id, {
      controlStatus: 'donwloadRequested',
    });
    this.databaseData = row ?? null;
  }

  async updateTrackedEpisodes(episodes: number[]) {
    if (!this.id) throw new Error('ID is not defined');
    await this.getById();
    episodes.forEach((episode) => {
      if (
        this.databaseData?.totalEpisodes &&
        episode > this.databaseData?.totalEpisodes
      )
        throw new Error('Episode is greater than total episodes');
    });
    await this.repo.update(this.id, {
      trackedEpisodes: episodes,
    });
  }

  async markAsTrackedAll() {
    if (!this.id) throw new Error('ID is not defined');
    await this.repo.update(this.id, {
      trackedEpisodes: this.databaseData?.totalEpisodes
        ? makeRange(1, this.databaseData?.totalEpisodes)
        : [],
    });
  }

  async deleteFileEpisode(filePath: string) {
    if (!this.id) throw new Error('ID is not defined');
    if (!this.databaseData) await this.getById();
    if ((this.databaseData?.files as string[]).includes(filePath)) {
      try {
        await new FileManagementService().deleteFile(filePath);
        await this.repo.update(this.id, {
          files: (this.databaseData?.files as string[])?.filter(
            (f) => f !== filePath
          ),
        });
      } catch (e) {
        throw new Error(`Failed to delete file: ${e}`);
      }
    }
  }
}
