import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import {
  createTorrentClient,
  type TorrentClientItemDto,
} from '@server/external/adapters/torrent-client';
import logger from '@server/lib/logger';

export const torrentClientRoute = new Hono().get('/', async (c) => {
  try {
    const client = await createTorrentClient({ id: 0 });
    const torrents = await client.getAllNormalized();
    const response: ApiResponse<TorrentClientItemDto[]> = {
      success: true,
      data: torrents,
    };
    return c.json(response);
  } catch (error) {
    logger.error(error);
    const response: ApiResponse<null> = {
      success: false,
      message: error instanceof Error ? error.message : 'Torrent client failed',
    };
    return c.json(response, 400);
  }
});
