import { SeriesDirectoryService } from '@server/features/file-management/series-directory.service';
import logger from '@server/lib/logger';
import type { ApiResponse } from '@shared/types';
import { handleStandardValidation } from '@server/lib/validation';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono/tiny';
import { z } from 'zod';

const verifySeriesDirectorySchema = z.object({
  path: z.string().trim().min(1, 'Series directory path is required'),
});

export const seriesDirectoryVerifyRoute = new Hono().post(
  '/',
  sValidator('json', verifySeriesDirectorySchema, handleStandardValidation),
  async (c) => {
    const { path: directoryPath } = c.req.valid('json');

    try {
      await new SeriesDirectoryService().testWriteAndDelete(directoryPath);
      return c.json<ApiResponse<{ path: string }>>({
        success: true,
        data: { path: directoryPath },
      });
    } catch (error: unknown) {
      const message: string =
        error instanceof Error ? error.message : String(error);
      logger.error(`Series directory permission test failed: ${message}`);
      return c.json<ApiResponse<null>>({ success: false, message }, 400);
    }
  },
);
