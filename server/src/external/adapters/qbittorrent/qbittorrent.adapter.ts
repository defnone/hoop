import {
  QBittorrent,
  TorrentFilePriority,
  type TorrentFile,
} from '@ctrl/qbittorrent';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { SettingsService } from '@server/features/settings/settings.service';
import { TorrentClientRepo } from '@server/external/adapters/torrent-client/torrent-client.repo';
import type {
  TorrentClientAction,
  TorrentClientItemDto,
  TorrentClientPort,
} from '@server/external/adapters/torrent-client/torrent-client.types';
import { toTorrentClientItemDto } from '@server/external/adapters/torrent-client/torrent-client.utils';
import { extractTorrentHash } from './qbittorrent.utils';

type QbittorrentAdapterParams = {
  id: number;
  client: QBittorrent;
  repo?: TorrentClientRepo;
  torrentItem?: DbTorrentItem;
  settings?: DbUserSettings;
};

export class QbittorrentAdapter implements TorrentClientPort {
  private readonly client: QBittorrent;
  private readonly id: number;
  private readonly repo: TorrentClientRepo;
  private torrentItem: DbTorrentItem | null;
  private readonly settings: DbUserSettings | null;

  constructor({
    id,
    client,
    repo,
    torrentItem,
    settings,
  }: QbittorrentAdapterParams) {
    this.client = client;
    this.id = id;
    this.repo = repo ?? new TorrentClientRepo();
    this.torrentItem = torrentItem ?? null;
    this.settings = settings ?? null;
  }

  async add(): Promise<void> {
    const { client, torrentItem, downloadDir } = await this.loadContext();
    if (!torrentItem) throw new Error('Torrent item not found');
    await client.addMagnet(torrentItem.magnet, {
      savepath: downloadDir ?? undefined,
    });
    const hash = extractTorrentHash(torrentItem.magnet);
    await this.repo.updateTorrentItem(torrentItem.id, {
      controlStatus: 'downloading',
      torrentClientId: hash,
      torrentClientType: 'qbittorrent',
    });
  }

  async remove(withData: boolean = false): Promise<void> {
    const { client, torrentItem } = await this.loadContext();
    if (!torrentItem?.torrentClientId) throw new Error('No torrent client id');
    await client.removeTorrent(torrentItem.torrentClientId, withData);
    await this.repo.updateTorrentItem(torrentItem.id, {
      controlStatus: 'idle',
      torrentClientId: null,
    });
  }

  async status(): Promise<NormalizedTorrent> {
    const { client, torrentItem } = await this.loadContext();
    if (!torrentItem?.torrentClientId) throw new Error('No torrent client id');
    const status = await client.getTorrent(torrentItem.torrentClientId);
    const files = await client.torrentFiles(torrentItem.torrentClientId);
    status.raw = { ...status.raw, files };
    return status;
  }

  async selectEpisodes(status: NormalizedTorrent): Promise<void> {
    const { client, torrentItem } = await this.loadContext();
    if (!torrentItem?.torrentClientId) throw new Error('No torrent client id');
    const files = status.raw.files as TorrentFile[];
    const trackedEpisodes = torrentItem.trackedEpisodes as number[];
    const unwantedIds = files.reduce<string[]>((ids, file, index) => {
      const episode = getEpisodeNumber(file.name);
      if (episode !== null && !trackedEpisodes.includes(episode)) {
        ids.push(index.toString());
      }
      return ids;
    }, []);
    if (unwantedIds.length > 0) {
      await client.setFilePriority(
        torrentItem.torrentClientId,
        unwantedIds,
        TorrentFilePriority.Skip,
      );
    }
  }

  async getAllNormalized(): Promise<TorrentClientItemDto[]> {
    const { client } = await this.loadContext();
    const data = await client.getAllData();
    return data.torrents.map(toTorrentClientItemDto);
  }

  async controlClientTorrent(
    id: string,
    action: TorrentClientAction,
  ): Promise<void> {
    const { client } = await this.loadContext();
    switch (action) {
      case 'pause':
        await client.pauseTorrent(id);
        return;
      case 'resume':
        await client.resumeTorrent(id);
        return;
      case 'verify':
        await client.recheckTorrent(id);
        return;
      case 'reannounce':
        await client.reannounceTorrent(id);
        return;
      case 'queue-top':
        await client.topPriority(id);
        return;
      case 'queue-up':
        await client.queueUp(id);
        return;
      case 'queue-down':
        await client.queueDown(id);
        return;
      case 'queue-bottom':
        await client.bottomPriority(id);
        return;
    }
  }

  async removeClientTorrent(
    id: string,
    deleteData: boolean,
  ): Promise<number | null> {
    const { client } = await this.loadContext();
    await client.removeTorrent(id, deleteData);
    const torrentItem = await this.repo.findTorrentItemByTorrentClientId(id);
    if (!torrentItem) return null;
    await this.repo.updateTorrentItem(torrentItem.id, {
      controlStatus: 'idle',
      torrentClientId: null,
    });
    return torrentItem.id;
  }

  private async loadContext(): Promise<{
    client: QBittorrent;
    torrentItem: DbTorrentItem | null;
    downloadDir: string | null;
  }> {
    const settings =
      this.settings ?? (await new SettingsService().getSettings());
    if (!settings) throw new Error('Torrent client settings not found');
    if (!this.torrentItem) {
      this.torrentItem = await this.repo.findTorrentItemById(this.id);
    }
    return {
      client: this.client,
      torrentItem: this.torrentItem,
      downloadDir: settings.downloadDir,
    };
  }
}

function getEpisodeNumber(fileName: string): number | null {
  const value =
    fileName.match(/[Ss](\d+)[.\-_–—x ]*[Ee][Pp]?(\d+)/i)?.[2] ??
    fileName.match(/(\d+)[.\-_–—x ]+(\d+)/i)?.[2] ??
    fileName.match(/[Ee][Pp]?(\d+)/i)?.[1] ??
    fileName.match(/(?<![A-Za-z0-9])(\d{2,3})(?![A-Za-z0-9])/g)?.[0];
  return value ? Number(value) : null;
}
