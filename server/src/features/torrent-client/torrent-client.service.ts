import {
  createTorrentClient,
  type TorrentClientAddRequest,
} from '@server/external/adapters/torrent-client';

export class TorrentClientService {
  async addTorrent(request: TorrentClientAddRequest): Promise<void> {
    const client = await createTorrentClient({ id: 0 });
    await client.addTorrent(request);
  }
}
