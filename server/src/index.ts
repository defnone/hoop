import { Hono } from 'hono/tiny';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { auth, handleAuthRequest } from './lib/auth';
import healthRoute from './routes/health';
import { onErrorHandler } from './shared/middlewares';
import logger from './lib/logger';
import { DownloadWorker } from './workers/download-worker';
import { updateWorker } from './workers/update-worker.instance';
import { torrentsStatusRoute } from './routes/torrents.status';
import { torrentsAddRoute } from './routes/torrents.add';
import { torrentsSyncRoute } from './routes/torrents.sync';
import { torrentsDeleteRoute } from './routes/torrents.$id.delete';
import { torrentsRoute } from './routes/torrents';
import { torrentsSaveTrackedEpRoute } from './routes/torrents.save-tracked-ep';
import { torrentsSaveNotificationsRoute } from './routes/torrents.save-notifications';
import { torrentClientAddRoute } from './routes/torrent-client.$id.add';
import { torrentClientDeleteRoute } from './routes/torrent-client.$id.delete';
import { torrentClientRoute } from './routes/torrent-client';
import { torrentClientActionRoute } from './routes/torrent-client.$id.action';
import { torrentClientRemoveRoute } from './routes/torrent-client.$id.remove';
import { torrentClientVerifyRoute } from './routes/torrent-client.verify';
import { runMigrations } from '../scripts/migrate';
import { deleteFileRoute } from './routes/files.$id.delete';
import { settingsRoute } from './routes/settings';
import { jackettSearchRoute } from './routes/jackett.search';
import { jackettVerifyRoute } from './routes/jackett.verify';
import { flaresolverrVerifyRoute } from './routes/flaresolverr.verify';
import { systemExitRoute } from './routes/system.exit';
import { trackersKinozalVerifyRoute } from './routes/trackers.kinozal.verify';
import { getUserCount } from './lib/utils';
import { torrentsPauseToggleRoute } from './routes/torrents.pause-toggle';
import { eventJournalRoute } from './routes/event-journal';
import { eventJournalReadRoute } from './routes/event-journal.$id.read';
import { eventJournalReadAllRoute } from './routes/event-journal.read-all';
import { seriesDirectoryVerifyRoute } from './routes/series-directory.verify';
import { SeriesDirectoryCleanupWorker } from './workers/series-directory-cleanup-worker';

export const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>().basePath('/api');

// Run DB migrations on startup
await runMigrations();

await getUserCount();
app.route('/health', healthRoute);

if (process.env.NODE_ENV !== 'production') {
  const { logger } = await import('hono/logger');
  app.use(logger());

  app.use(
    '*',
    cors({
      origin: process.env.ORIGIN || 'http://localhost:5173',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['POST', 'GET', 'OPTIONS', 'DELETE', 'PUT'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    }),
  );
}

app.onError(onErrorHandler);

app.on(['POST', 'GET'], '/auth/*', (c) => {
  return handleAuthRequest(c.req.raw);
});

app.use('*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set('user', null);
    c.set('session', null);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  return next();
});

// Routes
export const routes = app
  .route('/system/exit', systemExitRoute)
  .route('/jackett/search', jackettSearchRoute)
  .route('/jackett/verify', jackettVerifyRoute)
  .route('/flaresolverr/verify', flaresolverrVerifyRoute)
  .route('/trackers/kinozal/verify', trackersKinozalVerifyRoute)
  .route('/event-journal', eventJournalRoute)
  .route('/event-journal/read-all', eventJournalReadAllRoute)
  .route('/event-journal/:id/read', eventJournalReadRoute)
  .route('/settings', settingsRoute)
  .route('/series-directory/verify', seriesDirectoryVerifyRoute)
  .route('/files/:id/delete', deleteFileRoute)
  .route('/torrents', torrentsRoute)
  .route('/torrents/status', torrentsStatusRoute)
  .route('/torrents/sync', torrentsSyncRoute)
  .route('/torrents/add', torrentsAddRoute)
  .route('/torrents/:id/delete', torrentsDeleteRoute)
  .route('/torrents/:id/save-tracked-ep', torrentsSaveTrackedEpRoute)
  .route('/torrents/:id/save-notifications', torrentsSaveNotificationsRoute)
  .route('/torrents/:id/pause-toggle', torrentsPauseToggleRoute)
  .route('/torrent-client', torrentClientRoute)
  .route('/torrent-client/verify', torrentClientVerifyRoute)
  .route('/torrent-client/:id/action', torrentClientActionRoute)
  .route('/torrent-client/:id/remove', torrentClientRemoveRoute)
  .route('/torrent-client/:id/add', torrentClientAddRoute)
  .route('/torrent-client/:id/delete', torrentClientDeleteRoute);

export type AppType = typeof routes;

// Root for static

const root = new Hono();
root.route('/', app);

const staticRoot =
  process.env.NODE_ENV === 'production' ? './static' : './static';
root.use('*', serveStatic({ root: staticRoot }));
root.get('*', async (c, next) => {
  return serveStatic({ root: staticRoot, path: 'index.html' })(c, next);
});

const port = parseInt(process.env.PORT || '3000');

if (process.env.HONO_WORKERS !== '0') {
  updateWorker.run();
  new DownloadWorker({}).run();
  new SeriesDirectoryCleanupWorker().run();
}

logger.info(`Database URL: ${process.env.DATABASE_URL}`);
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);

export default {
  host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost',
  port,
  fetch: root.fetch,
};
