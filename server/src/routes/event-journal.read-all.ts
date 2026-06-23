import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import logger from '@server/lib/logger';
import { EventJournalService } from '@server/features/event-journal/event-journal.service';

export const eventJournalReadAllRoute = new Hono().put('/', async (c) => {
  try {
    const data = await new EventJournalService().markAllAsRead();
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
});
