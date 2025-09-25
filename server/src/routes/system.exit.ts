import { Hono } from 'hono/tiny';

export const systemExitRoute = new Hono().post('/', POST);

async function POST() {
  process.exit(0);
}
