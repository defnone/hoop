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
import { getEpisodeNumbersFromFilePath } from '@server/external/adapters/torrent-client/episode-file.utils';
import { toTorrentClientItemDto } from '@server/external/adapters/torrent-client/torrent-client.utils';
import {
  extractTorrentHash,
  normalizeTorrentMagnet,
} from './qbittorrent.utils';

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
    const magnet = normalizeTorrentMagnet(torrentItem.magnet);
    await client.addMagnet(magnet, {
      savepath: downloadDir ?? undefined,
    });
    const hash = extractTorrentHash(magnet);
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
    const wantedIds: string[] = [];
    const unwantedIds: string[] = [];

    for (const [index, file] of files.entries()) {
      const episodes = getEpisodeNumbersFromFilePath(file.name);
      if (episodes.length === 0) continue;
      const isTracked = episodes.some((episode) =>
        trackedEpisodes.includes(episode),
      );
      if (isTracked) {
        if (file.priority === TorrentFilePriority.Skip) {
          wantedIds.push(index.toString());
        }
      } else {
        unwantedIds.push(index.toString());
      }
    }

    if (wantedIds.length > 0) {
      await client.setFilePriority(
        torrentItem.torrentClientId,
        wantedIds,
        TorrentFilePriority.NormalPriority,
      );
    }
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
    return data.torrents.map((torrent) => {
      const item = toTorrentClientItemDto(torrent);
      return {
        ...item,
        peersSendingToUs: torrent.connectedSeeds,
        peersGettingFromUs: torrent.connectedPeers,
      };
    });
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
