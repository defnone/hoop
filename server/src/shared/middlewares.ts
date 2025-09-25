import type { Context } from 'hono';
import logger from '../lib/logger';
import type { ErrorResponse } from './types';

/** Map thrown errors to HTTP status and payload */
export function mapError(err: unknown): ErrorResponse {
  if (err instanceof Error) {
    switch (err.message) {
      case 'NOT_FOUND':
        return { status: 404, body: { success: false, message: 'Not found' } };
      case 'UNAUTHORIZED':
        return {
          status: 401,
          body: { success: false, message: 'Unauthorized' },
        };
      case 'VALIDATION_FAILED':
        return {
          status: 400,
          body: { success: false, message: 'Validation failed' },
        };
    }
    return { status: 500, body: { success: false, message: 'Internal error' } };
  }
  return { status: 500, body: { success: false, message: 'Unknown error' } };
}

export function onErrorHandler(err: Error, c: Context): Response {
  const { status, body } = mapError(err as unknown);
  const method = c.req.method;
  const url = c.req.url;
  const msg = err?.message ?? 'UNKNOWN';
  logger.error({ err, status, method, url, msg }, 'Unhandled error');
  return c.json(body, status);
}
