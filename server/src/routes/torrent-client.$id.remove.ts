import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';
import { statusStorage } from '@server/workers/download-worker';
import { torrentClientIdParamSchema } from '@server/routes/torrent-client.schemas';

const querySchema = z.object({
  deleteData: z.enum(['true', 'false']).default('false'),
});

export const torrentClientRemoveRoute = new Hono().delete(
  '/',
  sValidator('param', torrentClientIdParamSchema, handleStandardValidation),
  sValidator('query', querySchema, handleStandardValidation),
  async (c) => {
    const { id } = c.req.valid('param');
    const { deleteData } = c.req.valid('query');

    try {
      const torrentItemId = await new TransmissionAdapter({
        id: 0,
      }).removeClientTorrent(id, deleteData === 'true');
      if (torrentItemId !== null) statusStorage.delete(torrentItemId);

      const response: ApiResponse<null> = {
        success: true,
        message:
          deleteData === 'true'
            ? 'Torrent and data removed from Transmission'
            : 'Torrent removed from Transmission',
      };
      return c.json(response);
    } catch (error) {
      logger.error(error);
      const response: ApiResponse<null> = {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Transmission removal failed',
      };
      return c.json(response, 400);
    }
  },
);
