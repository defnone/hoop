import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import logger from '@server/lib/logger';
import z from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';

const paramSchema = z.object({
  id: z.coerce.number({ message: 'id is required' }).min(1),
});

export const eventJournalReadRoute = new Hono().put(
  '/',
  sValidator('param', paramSchema, handleStandardValidation),
  async (c) => {
    const { id } = c.req.valid('param');

    try {
      const data = await new EventJournalService().markAsRead(id);
      if (!data) {
        const response: ApiResponse<null> = {
          success: false,
          message: 'Event not found',
        };
        return c.json(response, 404);
      }

      const response: ApiResponse<typeof data> = {
        success: true,
        data,
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
  },
);
