import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { onErrorHandler, mapError } from '../src/shared/middlewares';

async function requestPath(path: string, thrower: () => never) {
  const app = new Hono();
  app.onError(onErrorHandler);
  app.get(path, (c) => {
    thrower();
    return c.text('unreachable');
  });
  const res = await app.request(path);
  const status: number = res.status;
  const json = (await res.json()) as { success: false; message: string };
  return { status, json };
}

describe('errorMiddleware', () => {
  it('maps NOT_FOUND to 404', async () => {
    const { status, json } = await requestPath('/nf', () => {
      throw new Error('NOT_FOUND');
    });
    expect(status).toBe(404);
    expect(json).toEqual({ success: false, message: 'Not found' });
  });

  it('maps UNAUTHORIZED to 401', async () => {
    const { status, json } = await requestPath('/unauth', () => {
      throw new Error('UNAUTHORIZED');
    });
    expect(status).toBe(401);
    expect(json).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('maps VALIDATION_FAILED to 400', async () => {
    const { status, json } = await requestPath('/bad', () => {
      throw new Error('VALIDATION_FAILED');
    });
    expect(status).toBe(400);
    expect(json).toEqual({ success: false, message: 'Validation failed' });
  });

  it('maps unknown Error to 500 INTERNAL_ERROR', async () => {
    const { status, json } = await requestPath('/unknown', () => {
      throw new Error('SOMETHING_ELSE');
    });
    expect(status).toBe(500);
    expect(json).toEqual({ success: false, message: 'Internal error' });
  });

  it('maps non-Error value to 500 UNKNOWN_ERROR (unit of mapError)', () => {
    const res = mapError('boom' as unknown);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Unknown error' });
  });
});
