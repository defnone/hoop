import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import logger from '@server/lib/logger';
import { verifyFlareSolverr } from '@server/external/adapters/tracker-data/flaresolverr';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const verifySchema = z.object({
  flaresolverrUrl: z
    .string()
    .trim()
    .pipe(z.url({ message: 'FlareSolverr URL is required' })),
  timeoutSeconds: z.number().int().min(1).max(300).default(60),
});

export const flaresolverrVerifyRoute = new Hono().post(
  '/',
  sValidator('json', verifySchema, handleStandardValidation),
  async (c) => {
    const { flaresolverrUrl, timeoutSeconds } = c.req.valid('json');

    try {
      await verifyFlareSolverr({
        serverUrl: flaresolverrUrl,
        timeout: timeoutSeconds * 1000,
      });
      const successResponse: ApiResponse<null> = {
        success: true,
        data: null,
      };
      return c.json(successResponse);
    } catch (error) {
      logger.error(error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error while testing FlareSolverr';
      const errorResponse: ApiResponse = {
        success: false,
        message: `Failed to test FlareSolverr: ${errorMessage}`,
      };
      return c.json(errorResponse, 500);
    }
  },
);
