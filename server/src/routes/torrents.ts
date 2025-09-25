import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import { statusStorage } from '@server/workers/download-worker';
import logger from '@server/lib/logger';
import z from 'zod';
import { zValidator } from '@hono/zod-validator';

const schema = z.object({
  page: z.coerce.number(),
  limit: z.coerce.number(),
});

export const torrentsRoute = new Hono().get(
  '/',
  zValidator('query', schema),
  async (c) => {
    const { page, limit } = c.req.valid('query');

    try {
      const ti = new TorrentItem({ url: '' });
      const status = Object.fromEntries(
        [...statusStorage].map(([id, data]) => [id, { data }])
      );
      const data = await ti.getAll(page, limit);
      const responseData = {
        status,
        ...data,
        lastSync: process.env.HOOP_LAST_SYNC ?? null,
      };

      const response: ApiResponse<typeof responseData> = {
        success: true,
        data: responseData,
      };

      return c.json(response);
    } catch (e) {
      logger.error(e);
      const response: ApiResponse = {
        success: false,
        message: (e as Error).message,
      };
      return c.json(response, 400);
    }
  }
);
