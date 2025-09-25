import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { ApiResponse } from '@shared/types';
import logger from '@server/lib/logger';

const connectionSchema = z.object({
  jackettUrl: z.string().url(),
});

const apiKeySchema = connectionSchema.extend({
  jackettApiKey: z.string().min(1),
});

const jackettTimeoutMs = 8000;

export const jackettVerifyRoute = new Hono()
  .post('/connection', zValidator('json', connectionSchema), async (c) => {
    const { jackettUrl } = c.req.valid('json');

    try {
      const url = new URL(jackettUrl);
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(jackettTimeoutMs),
      });

      if (response.status >= 500) {
        const errorResponse: ApiResponse = {
          success: false,
          message: `Jackett responded with ${response.status} ${response.statusText}`,
          code: response.status,
        };
        return c.json(errorResponse, 502);
      }

      const successResponse: ApiResponse<{
        status: number;
        statusText: string;
      }> = {
        success: true,
        data: { status: response.status, statusText: response.statusText },
      };

      return c.json(successResponse);
    } catch (error) {
      logger.error(error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error while testing connection';
      const errorResponse: ApiResponse = {
        success: false,
        message: `Failed to reach Jackett: ${errorMessage}`,
      };
      return c.json(errorResponse, 500);
    }
  })
  .post('/api-key', zValidator('json', apiKeySchema), async (c) => {
    const { jackettUrl, jackettApiKey } = c.req.valid('json');

    try {
      const endpoint = new URL('/api/v2.0/indexers/all/results/', jackettUrl);
      endpoint.searchParams.set('apikey', jackettApiKey);
      endpoint.searchParams.set('Query', 'ping');
      endpoint.searchParams.set('Category', '5000');

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(jackettTimeoutMs),
      });

      if (response.status === 401) {
        const errorResponse: ApiResponse = {
          success: false,
          message: 'Provided Jackett API Key is invalid',
          code: 401,
        };
        return c.json(errorResponse, 401);
      }

      if (!response.ok) {
        const errorResponse: ApiResponse = {
          success: false,
          message: `Jackett responded with ${response.status} ${response.statusText}`,
          code: response.status,
        };
        return c.json(errorResponse, 502);
      }

      const successResponse: ApiResponse<{ status: number }> = {
        success: true,
        data: { status: response.status },
      };

      return c.json(successResponse);
    } catch (error) {
      logger.error(error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error while validating API Key';
      const errorResponse: ApiResponse = {
        success: false,
        message: `Failed to validate Jackett API Key: ${errorMessage}`,
      };
      return c.json(errorResponse, 500);
    }
  });
