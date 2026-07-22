import type { DbUserSettingsInsert } from '@server/db/app/app-schema';
import { SettingsRepo } from './settings.repo';

type SettingsPayload = Omit<DbUserSettingsInsert, 'id'>;

interface SettingsServiceParams {
  repo?: SettingsRepo;
  data?: SettingsPayload;
}

export class SettingsService {
  private readonly repo: SettingsRepo;
  private data: SettingsPayload | undefined;

  constructor({ repo = new SettingsRepo(), data }: SettingsServiceParams = {}) {
    this.repo = repo;
    this.data = data;
  }

  async getSettings() {
    return await this.repo.findSettings();
  }

  async upsert() {
    if (!this.data) throw new Error('No data provided');
    await this.assertTorrentClientCanChange();
    return await this.repo.upsert(this.data);
  }

  async update() {
    if (!this.data) throw new Error('No data provided');
    await this.assertTorrentClientCanChange();
    return await this.repo.update(this.data);
  }

  private async assertTorrentClientCanChange(): Promise<void> {
    if (!this.data?.torrentClientType) return;
    const current = await this.repo.findSettings();
    if (!current || current.torrentClientType === this.data.torrentClientType) {
      return;
    }
    if (
      await this.repo.hasActiveTorrentForOtherClient(
        this.data.torrentClientType,
      )
    ) {
      throw new Error(
        'Cannot change torrent client while downloads are active',
      );
    }
  }
}
