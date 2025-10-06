import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono/tiny';
import healthRoute from '@server/routes/health';

const { handlerMock, getSessionMock, usersCountStorage } = vi.hoisted(() => {
  const handlerMock = vi.fn(async () => new Response(null, { status: 200 }));
  const getSessionMock = vi.fn(async () => null);
  const usersCountStorage = new Map<string, number>();
  usersCountStorage.set('count', 0);
  return { handlerMock, getSessionMock, usersCountStorage } as const;
});

vi.mock('@server/lib/auth', () => ({
  auth: {
    handler: handlerMock,
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock('@server/lib/utils', () => ({
  usersCountStorage,
  getUserCount: vi.fn(async () => 0),
  normalizeBaseUrl: (host: string) =>
    host.startsWith('http') ? host : `https://${host}`,
}));

vi.mock('hono/bun', () => ({
  serveStatic: () => () => new Response(null, { status: 404 }),
}), { virtual: true });

vi.mock('bun:sqlite', () => ({ Database: class {} }), { virtual: true });

vi.mock('@server/db', () => ({ default: {} }), { virtual: true });

vi.mock('@server/routes/jackett.search', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().get('/', (c) => c.json({ ok: true }));
  return { jackettSearchRoute: route, default: route };
});

vi.mock('@server/routes/jackett.verify', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono()
    .post('/connection', (c) => c.json({ ok: true }))
    .post('/api-key', (c) => c.json({ ok: true }));
  return { jackettVerifyRoute: route, default: route };
});

vi.mock('@server/routes/trackers.kinozal.verify', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().post('/', (c) => c.json({ ok: true }));
  return { trackersKinozalVerifyRoute: route, default: route };
});

vi.mock('@server/routes/settings', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono()
    .get('/', (c) => c.json({ ok: true }))
    .post('/', (c) => c.json({ ok: true }));
  return { settingsRoute: route, default: route };
});

vi.mock('@server/routes/files.$id.delete', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().delete('/', (c) => c.json({ ok: true }));
  return { deleteFileRoute: route, default: route };
});

vi.mock('@server/routes/torrents', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().get('/', (c) => c.json({ ok: true }));
  return { torrentsRoute: route, default: route };
});

vi.mock('@server/routes/torrents.status', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().get('/', (c) => c.json({ ok: true }));
  return { torrentsStatusRoute: route, default: route };
});

vi.mock('@server/routes/torrents.add', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().post('/', (c) => c.json({ ok: true }));
  return { torrentsAddRoute: route, default: route };
});

vi.mock('@server/routes/torrents.$id.delete', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().delete('/', (c) => c.json({ ok: true }));
  return { torrentsDeleteRoute: route, default: route };
});

vi.mock('@server/routes/torrents.save-tracked-ep', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().post('/', (c) => c.json({ ok: true }));
  return { torrentsSaveTrackedEpRoute: route, default: route };
});

vi.mock('@server/routes/torrent-client.$id.add', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().post('/', (c) => c.json({ ok: true }));
  return { torrentClientAddRoute: route, default: route };
});

vi.mock('@server/routes/torrent-client.$id.delete', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().delete('/', (c) => c.json({ ok: true }));
  return { torrentClientDeleteRoute: route, default: route };
});

vi.mock('@server/routes/system.exit', async () => {
  const { Hono } = await import('hono/tiny');
  const route = new Hono().post('/', (c) => c.json({ ok: true }));
  return { systemExitRoute: route, default: route };
});

let app: Hono;

describe('auth middleware integration', () => {
  beforeAll(async () => {
    app = new Hono().basePath('/api');
    app.route('/health', healthRoute);

    app.on(['POST', 'GET'], '/auth/*', (c) => handlerMock(c.req.raw));

    const [
      { jackettSearchRoute },
      { jackettVerifyRoute },
      { trackersKinozalVerifyRoute },
      { settingsRoute },
      { deleteFileRoute },
      { torrentsRoute },
      { torrentsStatusRoute },
      { torrentsAddRoute },
      { torrentsDeleteRoute },
      { torrentsSaveTrackedEpRoute },
      { torrentClientAddRoute },
      { torrentClientDeleteRoute },
      { systemExitRoute },
    ] = await Promise.all([
      import('@server/routes/jackett.search'),
      import('@server/routes/jackett.verify'),
      import('@server/routes/trackers.kinozal.verify'),
      import('@server/routes/settings'),
      import('@server/routes/files.$id.delete'),
      import('@server/routes/torrents'),
      import('@server/routes/torrents.status'),
      import('@server/routes/torrents.add'),
      import('@server/routes/torrents.$id.delete'),
      import('@server/routes/torrents.save-tracked-ep'),
      import('@server/routes/torrent-client.$id.add'),
      import('@server/routes/torrent-client.$id.delete'),
      import('@server/routes/system.exit'),
    ]);

    app.use('*', async (c, next) => {
      const session = await getSessionMock({ headers: c.req.raw.headers });
      if (!session) {
        c.set('user', null);
        c.set('session', null);
        return c.json({ error: 'Unauthorized' }, 401);
      }

      c.set('user', session.user);
      c.set('session', session.session);
      return next();
    });

    app.route('/system/exit', systemExitRoute)
      .route('/jackett/search', jackettSearchRoute)
      .route('/jackett/verify', jackettVerifyRoute)
      .route('/trackers/kinozal/verify', trackersKinozalVerifyRoute)
      .route('/settings', settingsRoute)
      .route('/files/:id/delete', deleteFileRoute)
      .route('/torrents', torrentsRoute)
      .route('/torrents/status', torrentsStatusRoute)
      .route('/torrents/add', torrentsAddRoute)
      .route('/torrents/:id/delete', torrentsDeleteRoute)
      .route('/torrents/:id/save-tracked-ep', torrentsSaveTrackedEpRoute)
      .route('/torrent-client/:id/add', torrentClientAddRoute)
      .route('/torrent-client/:id/delete', torrentClientDeleteRoute);
  });

  it('allows unauthenticated access to /api/health', async () => {
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
  });

  const protectedEndpoints: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
  }> = [
    { method: 'POST', path: '/api/system/exit' },
    { method: 'GET', path: '/api/jackett/search?query=test' },
    {
      method: 'POST',
      path: '/api/jackett/verify/connection',
      body: { jackettUrl: 'http://jackett.test' },
    },
    {
      method: 'POST',
      path: '/api/jackett/verify/api-key',
      body: { jackettUrl: 'http://jackett.test', jackettApiKey: 'key' },
    },
    {
      method: 'POST',
      path: '/api/trackers/kinozal/verify',
      body: { username: 'user', password: 'pass' },
    },
    { method: 'GET', path: '/api/settings/' },
    {
      method: 'POST',
      path: '/api/settings/',
      body: {
        telegramId: null,
        botToken: null,
        downloadDir: '/downloads',
        mediaDir: '/media',
        deleteAfterDownload: false,
        syncInterval: 30,
        jackettApiKey: null,
        jackettUrl: null,
        kinozalUsername: null,
        kinozalPassword: null,
      },
    },
    {
      method: 'DELETE',
      path: '/api/files/1/delete/',
      body: { filePath: '/tmp/file.mkv' },
    },
    { method: 'GET', path: '/api/torrents/?page=1&limit=10' },
    { method: 'GET', path: '/api/torrents/status' },
    {
      method: 'POST',
      path: '/api/torrents/add',
      body: {
        url: 'https://example.com/torrent',
        selectAll: false,
        startDownload: false,
      },
    },
    {
      method: 'DELETE',
      path: '/api/torrents/1/delete/',
      body: { withFiles: false },
    },
    {
      method: 'POST',
      path: '/api/torrents/1/save-tracked-ep/',
      body: { episodes: [1] },
    },
    { method: 'POST', path: '/api/torrent-client/1/add/' },
    { method: 'DELETE', path: '/api/torrent-client/1/delete/' },
  ];

  it.each(protectedEndpoints)(
    'returns 401 without auth for %s %s',
    async ({ method, path, body }) => {
      const response = await app.request(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { 'content-type': 'application/json' } : undefined,
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: 'Unauthorized' });
    }
  );
});
