import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TorrentItem } from '@server/features/torrent-item/torrent-item.service';
import { z } from 'zod';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';
import { handleZodValidation } from '@server/lib/validation';

const paramSchema = z.object({
  id: z.coerce.number().min(1),
});

export const torrentsPauseToggleRoute = new Hono().put(
  '/',
  zValidator('param', paramSchema, handleZodValidation),

  async (c) => {
    const { id } = c.req.valid('param');
    try {
      const ti = new TorrentItem({
        id,
      });
      await ti.getById();

      const isPaused = ti.databaseData?.controlStatus === 'paused';
      const isIdle = ti.databaseData?.controlStatus === 'idle';

      if (!isIdle && !isPaused) {
        const response: ApiResponse<null> = {
          success: false,
          message: 'Torrent is not idle or paused, cannot toggle pause status',
        };
        return c.json(response, 400);
      }

      if (!isPaused) {
        await ti.markAsPaused();
      } else {
        await ti.markAsIdle();
      }

      const response: ApiResponse<null> = {
        success: true,
        message: `Torrent tracking ${!isPaused ? 'paused' : 'unpaused'}`,
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
