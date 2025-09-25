import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import { z } from 'zod';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';
import { zValidator } from '@hono/zod-validator';

const paramSchema = z.object({
  id: z.coerce.number(),
});

export const torrentClientAddRoute = new Hono().post(
  '/',
  zValidator('param', paramSchema),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      await new TransmissionAdapter({
        id,
      }).add();

      const response: ApiResponse<null> = {
        success: true,
        message: 'Torrent added',
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
