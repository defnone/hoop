import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import { z } from 'zod';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';

const jsonSchema = z.object({
  withFiles: z.boolean(),
});

const paramSchema = z.object({
  id: z.coerce.number(),
});

export const torrentsDeleteRoute = new Hono().delete(
  '/',
  zValidator('json', jsonSchema),
  zValidator('param', paramSchema),
  async (c) => {
    const { withFiles } = c.req.valid('json');
    const { id } = c.req.valid('param');

    try {
      await new TorrentItem({
        id,
      }).delete(withFiles);
      const response: ApiResponse<null> = {
        success: true,
        message: 'Torrent deleted',
      };
      return c.json(response, 200);
    } catch (e) {
      logger.error(e);
      const response: ApiResponse<null> = {
        success: false,
        message: (e as Error).message,
      };
      return c.json(response, 400);
    }
  }
);
