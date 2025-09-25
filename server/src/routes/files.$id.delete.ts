import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { z } from 'zod';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';

const jsonSchema = z.object({
  filePath: z.string(),
});
const paramSchema = z.object({
  id: z.coerce.number(),
});

export const deleteFileRoute = new Hono().delete(
  '/',
  zValidator('json', jsonSchema),
  zValidator('param', paramSchema),
  async (c) => {
    const { filePath } = c.req.valid('json');
    const { id } = c.req.valid('param');

    try {
      await new TorrentItem({ id }).deleteFileEpisode(filePath);
      const response: ApiResponse<null> = {
        success: true,
        message: 'File deleted',
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
