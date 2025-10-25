import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const jsonSchema = z.object({
  filePath: z.string(),
});
const paramSchema = z.object({
  id: z.coerce.number(),
});

export const deleteFileRoute = new Hono().delete(
  '/',
  sValidator('json', jsonSchema, handleStandardValidation),
  sValidator('param', paramSchema, handleStandardValidation),
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
