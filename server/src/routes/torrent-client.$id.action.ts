import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import {
  createTorrentClient,
  torrentClientActions,
} from '@server/external/adapters/torrent-client';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';
import { torrentClientIdParamSchema } from '@server/routes/torrent-client.schemas';

const actionSchema = z.object({
  action: z.enum(torrentClientActions),
});

export const torrentClientActionRoute = new Hono().put(
  '/',
  sValidator('param', torrentClientIdParamSchema, handleStandardValidation),
  sValidator('json', actionSchema, handleStandardValidation),
  async (c) => {
    const { id } = c.req.valid('param');
    const { action } = c.req.valid('json');

    try {
      const client = await createTorrentClient({ id: 0 });
      await client.controlClientTorrent(id, action);
      const response: ApiResponse<null> = {
        success: true,
        message: `Torrent action completed: ${action}`,
      };
      return c.json(response);
    } catch (error) {
      logger.error(error);
      const response: ApiResponse<null> = {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Torrent client action failed',
      };
      return c.json(response, 400);
    }
  },
);
