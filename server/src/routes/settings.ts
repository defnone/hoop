import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import logger from '@server/lib/logger';
import { SettingsService } from '@server/features/settings/settings.service';
import { userSettings } from '@server/db/app/app-schema';
import { createSelectSchema } from 'drizzle-zod';
import { zValidator } from '@hono/zod-validator';

const jsonSchema = createSelectSchema(userSettings);

export const settingsRoute = new Hono()
  .get('/', async (c) => {
    try {
      const settings = await new SettingsService().getSettings();
      const response: ApiResponse<typeof settings> = {
        success: true,
        data: settings,
      };
      return c.json(response);
    } catch (e) {
      const response: ApiResponse = {
        success: false,
        message: (e as Error).message,
      };
      logger.error(e);
      return c.json(response, 400);
    }
  })
  .post('/', zValidator('json', jsonSchema), async (c) => {
    const data = c.req.valid('json');
    try {
      const resp = await new SettingsService({ data }).upsert();
      const response: ApiResponse<typeof resp> = {
        success: true,
        data: resp,
      };
      return c.json(response);
    } catch (e) {
      const response: ApiResponse = {
        success: false,
        message: (e as Error).message,
      };
      logger.error(e);
      return c.json(response, 400);
    }
  });
