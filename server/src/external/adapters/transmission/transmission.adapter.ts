import type { AddTorrentOptions, Transmission } from '@ctrl/transmission';
import type {
  AddMagnetResult,
  EpisodeSelectionStatus,
  TransmissionItemParams,
} from './transmission.types';
import { TransmissionClientRepo } from './transmission.repo';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { SettingsService } from '@server/features/settings/settings.service';
import type {
  TorrentClientAction,
  TorrentClientItemDto,
} from '@server/external/adapters/torrent-client/torrent-client.types';
import { toTorrentClientItemDto } from './transmission.utils';
import { normalizeTransmissionError } from './transmission-error.utils';
import type { NormalizedTorrent } from '@ctrl/shared-torrent';

export class TransmissionAdapter {
  private client: Transmission;
  private id: number;
  private tiData: DbTorrentItem | null = null;
  private uSettings: DbUserSettings | null = null;
  private readonly repo: TransmissionClientRepo;
  constructor({
    id,
    client,
    repo,
    torrentItem,
    settings,
  }: TransmissionItemParams) {
    this.client = client;
    this.id = id;
    this.repo = repo || new TransmissionClientRepo();
    this.tiData = torrentItem || null;
    this.uSettings = settings ?? null;
  }

  async loadSettings() {
    if (!this.tiData)
      this.tiData = await this.repo.findTorrentItemById(this.id);
    if (!this.uSettings) {
      this.uSettings = await new SettingsService().getSettings();
    }
  }

  async add(): Promise<void> {
    await this.loadSettings();
    if (!this.tiData) throw new Error('Torrent item not found');

    const options: Partial<AddTorrentOptions> = {};
    if (this.uSettings?.downloadDir)
      options['download-dir'] = this.uSettings.downloadDir;
    try {
      const result: AddMagnetResult = await this.client.addMagnet(
        this.tiData.magnet,
        options,
      );
      const added =
        result.arguments['torrent-added'] ??
        result.arguments['torrent-duplicate'];
      const hash = added?.hashString;
      if (!hash) throw new Error('Transmission did not return hashString');

      await this.repo.updateTorrentItem(this.tiData.id, {
        controlStatus: 'downloading',
        torrentClientId: hash,
        torrentClientType: 'transmission',
      });
    } catch (e: unknown) {
      const normalizedError = normalizeTransmissionError(e);
      throw new Error(`Failed to add torrent: ${normalizedError.message}`, {
        cause: normalizedError,
      });
    }
  }

  async remove(withData: boolean = false) {
    await this.loadSettings();
    if (!this.tiData?.torrentClientId) throw new Error('No torrent client id');
    await this.client.removeTorrent(this.tiData.torrentClientId, withData);
    await this.repo.updateTorrentItem(this.tiData.id, {
      controlStatus: 'idle',
      torrentClientId: null,
    });
  }

  async status(): Promise<NormalizedTorrent> {
    await this.loadSettings();
    if (!this.tiData?.torrentClientId) throw new Error('No torrent client id');
    try {
      const status = await this.client.getTorrent(this.tiData.torrentClientId);
      if (!status) throw new Error('Torrent not found');
      return status;
    } catch (error: unknown) {
      throw normalizeTransmissionError(error);
    }
  }

  async selectEpisodes(status: NormalizedTorrent | EpisodeSelectionStatus) {
    await this.loadSettings();
    const filesFromClient = status.raw.files as Record<string, string>[];
    const trackedEpisodes = this.tiData?.trackedEpisodes as number[];
    const forUnselect = filesFromClient.reduce((arr: number[], file, index) => {
      if (!file || !file.name) return arr;
      const episodeNumber =
        file.name.match(/[Ss](\d+)[.\-_–—x ]*[Ee][Pp]?(\d+)/i)?.[2] ||
        file.name.match(/(\d+)[.\-_–—x ]+(\d+)/i)?.[2] ||
        file.name.match(/[Ee][Pp]?(\d+)/i)?.[1] ||
        // Fallback: pure 2-3 digit episode token with non-alphanumeric boundaries
        file.name.match(/(?<![A-Za-z0-9])(\d{2,3})(?![A-Za-z0-9])/g)?.[0];
      if (episodeNumber && !trackedEpisodes.includes(Number(episodeNumber))) {
        arr.push(index);
      }
      return arr;
    }, []);

    if (!this.tiData?.torrentClientId) throw new Error('No torrent client id');
    if (forUnselect.length > 0)
      await this.client.setTorrent(this.tiData.torrentClientId, {
        'files-unwanted': forUnselect,
      });
  }

  async getAll() {
    const status = await this.client.listTorrents();
    return status.arguments.torrents;
  }

  async getAllNormalized(): Promise<TorrentClientItemDto[]> {
    const data = await this.client.getAllData();
    return data.torrents.map(toTorrentClientItemDto);
  }

  async controlClientTorrent(
    clientId: string,
    action: TorrentClientAction,
  ): Promise<void> {
    switch (action) {
      case 'pause':
        await this.client.pauseTorrent(clientId);
        return;
      case 'resume':
        await this.client.resumeTorrent(clientId);
        return;
      case 'verify':
        await this.client.verifyTorrent(clientId);
        return;
      case 'reannounce':
        await this.client.reannounceTorrent(clientId);
        return;
      case 'queue-top':
        await this.client.queueTop(clientId);
        return;
      case 'queue-up':
        await this.client.queueUp(clientId);
        return;
      case 'queue-down':
        await this.client.queueDown(clientId);
        return;
      case 'queue-bottom':
        await this.client.queueBottom(clientId);
        return;
    }
  }

  async removeClientTorrent(
    clientId: string,
    deleteData: boolean,
  ): Promise<number | null> {
    await this.client.removeTorrent(clientId, deleteData);
    const torrentItem =
      await this.repo.findTorrentItemByTorrentClientId(clientId);

    if (!torrentItem) return null;

    await this.repo.updateTorrentItem(torrentItem.id, {
      controlStatus: 'idle',
      torrentClientId: null,
    });
    return torrentItem.id;
  }
}
