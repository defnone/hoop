import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cache } from 'hono/cache';
import { cors } from 'hono/cors';
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare';
import { getTmdbData } from './getTmdbData';
import type { TmdbEnvironment, TmdbPeriod } from './types/tmdb';

const app = new Hono<TmdbEnvironment>();

app.use(
  '*',
  cloudflareRateLimiter<TmdbEnvironment, '*', {}>({
    rateLimitBinding: (c) => c.env.RATE_LIMITER,
    keyGenerator: (c) => resolveRateLimitKey(c),
  }),
);

app.use(
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['*'],
    maxAge: 86400,
  }) as MiddlewareHandler<TmdbEnvironment, string>,
);

app.use(
  cache({
    cacheName: 'tmdb-proxy-cache-v3',
    cacheControl: 'max-age=3600',
  }) as MiddlewareHandler<TmdbEnvironment, string>,
);

app.get('/api/tmdb/:period', async (c) => {
  const period = c.req.param('period');

  if (!isTmdbPeriod(period)) {
    return c.json({ error: 'Invalid period, supports daily or weekly' }, 400);
  }

  if (!c.env.TMDB_API_TOKEN) {
    return c.json({ error: 'TMDB API token is not configured' }, 503);
  }

  const data = await getTmdbData(c, period);

  return c.json(data);
});

export default app;

function resolveRateLimitKey(c: Context<TmdbEnvironment>): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;

  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  const xri = c.req.header('x-real-ip');
  if (xri) return xri;
  const cfRay = c.req.header('cf-ray');
  if (cfRay) return `cf-ray:${cfRay}`;

  const ua = c.req.header('user-agent') ?? 'unknown-ua';
  const al = c.req.header('accept-language') ?? 'unknown-lang';
  return `anon:${ua}:${al}`;
}

function isTmdbPeriod(value: string): value is TmdbPeriod {
  return value === 'daily' || value === 'weekly';
}
