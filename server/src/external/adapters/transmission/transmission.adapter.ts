import { Transmission, type AddTorrentOptions } from '@ctrl/transmission';
import type {
  AddMagnetResult,
  TransmissionItemParams,
} from './transmission.types';
import { TransmissionClientRepo } from './transmission.repo';
import type { DbTorrentItem, DbUserSettings } from '@server/db/app/app-schema';
import { SettingsService } from '@server/features/settings/settings.service';

export class TransmissionAdapter {
  private client: Transmission;
  private id: number;
  private tiData: DbTorrentItem | null = null;
  private uSettings: DbUserSettings | null = null;
  private readonly repo: TransmissionClientRepo;
  constructor({ id, client, repo, torrentItem }: TransmissionItemParams) {
    this.client =
      client ||
      new Transmission({
        baseUrl: process.env.TRANSMISSION_BASE_URL,
        username: process.env.TRANSMISSION_USERNAME,
        password: process.env.TRANSMISSION_PASSWORD,
      });
    this.id = id;
    this.repo = repo || new TransmissionClientRepo();
    this.tiData = torrentItem || null;

    if (
      !process.env.TRANSMISSION_BASE_URL ||
      !process.env.TRANSMISSION_USERNAME ||
      !process.env.TRANSMISSION_PASSWORD
    )
      throw new Error(
        'TRANSMISSION_BASE_URL, TRANSMISSION_USERNAME, TRANSMISSION_PASSWORD must be set in env'
      );
  }

  async loadSettings() {
    if (!this.tiData)
      this.tiData = await this.repo.findTorrentItemById(this.id);
    this.uSettings = await new SettingsService().getSettings();
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
        options
      );
      const added =
        result.arguments['torrent-added'] ??
        result.arguments['torrent-duplicate'];
      const hash = added?.hashString;
      if (!hash) throw new Error('Transmission did not return hashString');

      await this.repo.updateTorrentItem(this.tiData.id, {
        controlStatus: 'downloading',
        transmissionId: hash,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to add torrent: ${msg}`);
    }
  }

  async remove(withData: boolean = false) {
    await this.loadSettings();
    if (!this.tiData?.transmissionId) throw new Error('No transmissionId');
    await this.client.removeTorrent(this.tiData.transmissionId, withData);
    await this.repo.updateTorrentItem(this.tiData.id, {
      controlStatus: 'idle',
      transmissionId: null,
    });
  }

  async status() {
    await this.loadSettings();
    if (!this.tiData?.transmissionId) throw new Error('No transmissionId');
    const status = await this.client.getTorrent(this.tiData.transmissionId);
    return status;
  }

  async selectEpisodes() {
    const status = await this.status();
    const filesFromClient = status.raw.files as Record<string, string>[];
    const trackedEpisodes = this.tiData?.trackedEpisodes as number[];
    const forUnselect = filesFromClient.reduce((arr: number[], file, index) => {
      if (!file || !file.name) return arr;
      const episodeNumber =
        file.name.match(/[Ss](\d+)[Ee](\d+)/i)?.[2] ||
        file.name.match(/(\d+)[.\-_–—x ]+(\d+)/i)?.[2] ||
        file.name.match(/[Ee](\d+)/i)?.[1] ||
        // Fallback: pure 2-3 digit episode token with non-alphanumeric boundaries
        file.name.match(/(?<![A-Za-z0-9])(\d{2,3})(?![A-Za-z0-9])/g)?.[0];
      if (episodeNumber && !trackedEpisodes.includes(Number(episodeNumber))) {
        arr.push(index);
      }
      return arr;
    }, []);

    if (!this.tiData?.transmissionId)
      throw new Error('No transmissionId found');
    if (forUnselect.length > 0)
      await this.client.setTorrent(this.tiData?.transmissionId, {
        'files-unwanted': forUnselect,
      });
  }

  async getAll() {
    const status = await this.client.listTorrents();
    return status.arguments.torrents;
  }
}
