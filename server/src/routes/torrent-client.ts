import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import {
  TransmissionAdapter,
  type TorrentClientItemDto,
} from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';

export const torrentClientRoute = new Hono().get('/', async (c) => {
  try {
    const torrents = await new TransmissionAdapter({
      id: 0,
    }).getAllNormalized();
    const response: ApiResponse<TorrentClientItemDto[]> = {
      success: true,
      data: torrents,
    };
    return c.json(response);
  } catch (error) {
    logger.error(error);
    const response: ApiResponse<null> = {
      success: false,
      message: error instanceof Error ? error.message : 'Transmission failed',
    };
    return c.json(response, 400);
  }
});
