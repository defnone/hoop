import { Hono } from 'hono/tiny';
import type { ApiResponse } from '@shared/types';
import logger from '@server/lib/logger';
import { customFetch } from '@server/shared/custom-fetch';
import { z } from 'zod';
import { sValidator } from '@hono/standard-validator';
import { handleStandardValidation } from '@server/lib/validation';

const connectionSchema = z.object({
  jackettUrl: z.url({ message: 'Jackett URL is required' }).trim(),
});

const apiKeySchema = connectionSchema.extend({
  jackettApiKey: z
    .string({ message: 'Jackett API Key is required' })
    .trim()
    .min(1, { message: 'Jackett API Key cannot be empty' }),
});

const jackettTimeoutMs = 10_000;

export const jackettVerifyRoute = new Hono()
  .post(
    '/connection',
    sValidator('json', connectionSchema, handleStandardValidation),
    async (c) => {
      const { jackettUrl } = c.req.valid('json');

      try {
        const url = new URL(jackettUrl);
        const response = await customFetch(
          url.toString(),
          {
            method: 'GET',
          },
          jackettTimeoutMs
        );

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
          message: errorMessage,
        };
        return c.json(errorResponse, 500);
      }
    }
  )
  .post(
    '/api-key',
    sValidator('json', apiKeySchema, handleStandardValidation),
    async (c) => {
      const { jackettUrl, jackettApiKey } = c.req.valid('json');

      try {
        const endpoint = new URL('/api/v2.0/indexers/all/results/', jackettUrl);
        endpoint.searchParams.set('apikey', jackettApiKey);
        endpoint.searchParams.set('Query', 'ping');
        endpoint.searchParams.set('Category', '5000');

        const response = await customFetch(
          endpoint.toString(),
          {
            method: 'GET',
          },
          jackettTimeoutMs
        );

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
    }
  );
