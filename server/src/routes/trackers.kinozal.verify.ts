import { Hono } from 'hono/tiny';
import type { ApiResponse } from 'shared/dist';
import logger from '@server/lib/logger';
import { TrackerAuth } from '@server/external/adapters/tracker-data/tracker-data.auth';
import { trackersConf } from '@server/shared/trackers-conf';
import { normalizeBaseUrl } from '@server/lib/utils';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const credentialsSchema = z.object({
  username: z
    .string({ message: 'Username must be a string' })
    .min(1, { message: 'Username is required' }),
  password: z
    .string({ message: 'Password must be a string' })
    .min(1, { message: 'Password is required' }),
});

export const trackersKinozalVerifyRoute = new Hono().post(
  '/',
  sValidator('json', credentialsSchema, handleStandardValidation),
  async (c) => {
    const { username, password } = c.req.valid('json');

    let lastError: unknown;

    const kinozalConfig = trackersConf.kinozal;

    if (!kinozalConfig) {
      logger.error('Kinozal is not configured');

      const response: ApiResponse = {
        success: false,
        message: 'Kinozal is not configured',
      };
      return c.json(response, 400);
    }

    for (const host of kinozalConfig.urls) {
      try {
        const trackerAuth = new TrackerAuth({
          login: username,
          password,
          baseUrl: normalizeBaseUrl(host),
          tracker: 'kinozal',
        });

        await trackerAuth.getCookies();

        const response: ApiResponse<{ valid: boolean }> = {
          success: true,
          data: { valid: true },
        };

        return c.json(response);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Kinozal auth attempt failed for host ${host}: ${message}`);
      }
    }

    const response: ApiResponse = {
      success: false,
      message:
        lastError instanceof Error
          ? lastError.message
          : 'Unable to authenticate against Kinozal with provided credentials',
    };

    return c.json(response, 400);
  }
);
