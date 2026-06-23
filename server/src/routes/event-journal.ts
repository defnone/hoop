import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import logger from '@server/lib/logger';
import z from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';

const schema = z.object({
  page: z.coerce.number({ message: 'page is required' }).min(1),
  limit: z.coerce.number({ message: 'limit is required' }).min(1).max(100),
});

export const eventJournalRoute = new Hono().get(
  '/',
  sValidator('query', schema, handleStandardValidation),
  async (c) => {
    const { page, limit } = c.req.valid('query');

    try {
      const data = await new EventJournalService().getAll(page, limit);
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
