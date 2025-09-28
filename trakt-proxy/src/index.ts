import { Hono } from 'hono';
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

// Initialize rate limiter middleware
app.use(
  cloudflareRateLimiter<AppType>({
    rateLimitBinding: (c) => c.env.RATE_LIMITER,
    keyGenerator: (c) => c.req.header('cf-connecting-ip') ?? '',
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

  console.log(`running ${period}`);
  const data = await getTraktData(c, period);

  return c.json(data);
});

export default app;
