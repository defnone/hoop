import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';
import { statusStorage } from '@server/workers/download-worker';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const paramSchema = z.object({
  id: z.coerce.number().min(1),
});

export const torrentClientDeleteRoute = new Hono().delete(
  '/',
  sValidator('param', paramSchema, handleStandardValidation),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      await new TransmissionAdapter({
        id,
      }).remove(true);
      statusStorage.delete(id);
      const response: ApiResponse<null> = {
        success: true,
        message: 'Torrent deleted from client',
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
