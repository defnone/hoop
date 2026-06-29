import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import {
  TransmissionAdapter,
  torrentClientActions,
} from '@server/external/adapters/transmission';
import logger from '@server/lib/logger';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const paramSchema = z.object({
  id: z.string().min(1),
});

const actionSchema = z.object({
  action: z.enum(torrentClientActions),
});

export const torrentClientActionRoute = new Hono().put(
  '/',
  sValidator('param', paramSchema, handleStandardValidation),
  sValidator('json', actionSchema, handleStandardValidation),
  async (c) => {
    const { id } = c.req.valid('param');
    const { action } = c.req.valid('json');

    try {
      await new TransmissionAdapter({ id: 0 }).controlClientTorrent(id, action);
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
          error instanceof Error ? error.message : 'Transmission action failed',
      };
      return c.json(response, 400);
    }
  },
);
