import { Hono } from 'hono/tiny';
import { statusStorage } from '@server/workers/download-worker';
import type { ApiResponse } from 'shared/dist';

export const torrentsStatusRoute = new Hono().get('/', (c) => {
  const status = Object.fromEntries(
    [...statusStorage].map(([id, data]) => [id, { data }])
  );
  const response: ApiResponse<typeof status> = {
    success: true,
    data: status,
  };
  return c.json(response);
});
