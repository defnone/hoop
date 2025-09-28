import { Hono } from 'hono';
import type { Context } from 'hono';
import { cache } from 'hono/cache';
import { getTraktData } from './getTraktData';
import { cors } from 'hono/cors';
import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare';

interface Bindings {
  RATE_LIMITER: RateLimit;
  CLIENT_ID: string;
}

interface Variables {
  rateLimit: boolean;
}

type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};

const app = new Hono<AppType>();

const resolveRateLimitKey = (c: Context<AppType>): string => {
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
};

// Initialize rate limiter middleware
app.use(
  cloudflareRateLimiter<AppType>({
    rateLimitBinding: (c) => c.env.RATE_LIMITER,
    keyGenerator: (c) => resolveRateLimitKey(c),
  })
);

// Initialize CORS middleware
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['*'],
    maxAge: 86400,
  })
);

// Initialize cache middleware
app.use(
  '*',
  cache({
    cacheName: 'trakt-proxy-cache',
    cacheControl: 'max-age=3600',
  })
);

app.get('/api/trakt/:period', async (c) => {
  const period = c.req.param('period') as 'weekly' | 'daily';
  const validPeriods = ['weekly', 'daily'];

  if (!validPeriods.includes(period)) {
    return c.json({ error: 'Invalid period, supports weekly or daily' }, 400);
  }

  const data = await getTraktData(c, period);

  return c.json(data);
});

export default app;
