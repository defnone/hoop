import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const paramSchema = z.object({
  id: z.coerce.number().min(1),
});

const jsonSchema = z.object({
  notifyOnTitleChange: z.boolean(),
  notifyOnMagnetChange: z.boolean(),
  notifyOnDownloadComplete: z.boolean(),
});

export const torrentsSaveNotificationsRoute = new Hono().put(
  '/',
  sValidator('param', paramSchema, handleStandardValidation),
  sValidator('json', jsonSchema, handleStandardValidation),
  async (c) => {
    const settings = c.req.valid('json');
    const { id } = c.req.valid('param');

    try {
      await new TorrentItem({ id }).updateNotifications(settings);
      return c.json<ApiResponse<null>>({
        success: true,
        message: 'Notification settings updated',
      });
    } catch (error) {
      logger.error(error);
      return c.json<ApiResponse<null>>(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Update failed',
        },
        400,
      );
    }
  },
);
