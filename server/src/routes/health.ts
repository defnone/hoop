import { Hono } from 'hono/tiny';
import type { Context } from 'hono';
import type { ApiResponse } from 'shared/dist';
import { usersCountStorage } from '@server/lib/utils';

export const healthRoute = new Hono().get('/', GET);

async function GET(c: Context) {
  let message: string;

  if (usersCountStorage.get('count') === 0) {
    message = 'First run';
  } else {
    message = 'OK';
  }

  const body: ApiResponse = {
    success: true,
    message,
  };
  return c.json(body, 200);
}

export default healthRoute;
