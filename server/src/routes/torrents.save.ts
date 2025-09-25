import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import { z } from 'zod';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';

const paramSchema = z.object({
  id: z.coerce.number(),
});

const jsonSchema = z.object({
  episodes: z.number().array(),
});

export const torrentsSaveRoute = new Hono().post(
  '/',
  zValidator('param', paramSchema),
  zValidator('json', jsonSchema),

  async (c) => {
    const { episodes } = c.req.valid('json');
    const { id } = c.req.valid('param');
    try {
      const ti = new TorrentItem({
        id,
      });

      await ti.updateTrackedEpisodes(episodes);

      const response: ApiResponse<null> = {
        success: true,
        message: 'Episodes updated',
      };
      return c.json(response);
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
