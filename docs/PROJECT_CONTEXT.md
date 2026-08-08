# HOOP Project Context

## Purpose and user behavior

HOOP tracks single-season TV torrent releases and downloads selected episodes when tracked releases change. Users can search through Jackett, save a release, select episodes, monitor torrent-client transfers, inspect the event journal, and configure notifications and tracker credentials. Discover data comes from a separate TMDB proxy.

## Architecture

The repository is a Bun monorepo:

- `client/`: React 19 and Vite single-page application.
- `server/`: Hono API, SQLite persistence through Drizzle, authentication through Better Auth, background update and download workers, and production static-file serving.
- `shared/`: shared TypeScript response types and utilities used by client and server.
- `trakt-proxy/`: legacy directory path containing the `tmdb-proxy` Cloudflare Worker package. The Worker proxies and caches TMDB daily and weekly trending responses independently from the single-origin server.

Production uses a single origin. The server exposes `/api`, serves the built client for other paths, runs database migrations at startup, and starts background workers unless `HONO_WORKERS=0`.

The update worker periodically checks idle tracked releases in batches. Changed tracker metadata updates stored torrent state and can request downloads or Telegram notifications. The download worker polls the configured torrent client, selects tracked episodes, records lifecycle events, and copies or links completed media into configured directories.

The optional Series Directory cleanup worker waits 24 hours after service startup and then runs every 24 hours. When enabled in settings, it recursively removes empty nested directories, never removes the configured root, and records removed paths or failures in the event journal. Absolute non-root paths are required. Settings also provide a write-and-delete permission test that creates and removes a temporary file and directory below the entered path.

Episode file placement supports partial success. Successfully copied episodes are removed from the tracked set while failed episodes remain eligible for retry. Copy failures are persisted per torrent and retried after 5 minutes, 15 minutes, 1 hour, then 6 hours for later attempts. The torrent remains in the client until every tracked episode is copied successfully. Repeated identical failures create at most one event-journal and Telegram failure notification per 24 hours; a previously reported failure sends a recovery notification after a successful retry.

## Discover and TMDB proxy

The independent Cloudflare Worker reads global TMDB TV trending data and exposes separate daily and weekly surfaces. It sorts provider results by descending popularity, returns the first 10 shows, and enriches them with IMDb IDs and official YouTube trailers. A failed detail request falls back to the trending result, so one missing enrichment does not fail the Discover page. The Worker keeps provider credentials outside the server and caches provider responses at the edge for one hour. The `trakt-proxy` directory remains the legacy filesystem path, while the workspace package is named `tmdb-proxy`.

## Public HTTP surface

Unauthenticated server endpoints are `/api/health` and Better Auth handlers under `/api/auth/*`. Other `/api` routes require a valid cookie session.

Authenticated route groups:

- `/api/settings`: application settings.
- `/api/series-directory/verify`: Series Directory write-and-delete permission test.
- `/api/jackett/*`, `/api/flaresolverr/*`, `/api/trackers/*`: search and integration verification.
- `/api/torrents/*`: tracked release CRUD, episode and notification selection, worker state, and manual sync.
- `/api/torrent-client/*`: transfer listing, verification, actions, removal, and deletion.
- `/api/files/*`: managed media-file deletion.
- `/api/event-journal/*`: event listing and read state.
- `/api/system/exit`: controlled process exit.

Client-server calls use the typed Hono RPC client exported from `client/src/lib/rpc.ts`. The TMDB proxy exposes `GET /api/tmdb/:period`, where `period` is `daily` or `weekly`.

## Configuration

Runtime configuration uses environment variables and persisted settings.

Core server variables:

- `DATABASE_URL`: SQLite database path. Production default is `data/sqlite.db`.
- `BETTER_AUTH_SECRET`: required authentication secret.
- `ORIGIN`: canonical application origin used by authentication and development CORS.
- `PORT`: HTTP port, default `3000`.
- `NODE_ENV`: selects production binding and logging behavior.
- `LOG_LEVEL`: optional log verbosity.
- `HONO_WORKERS`: set to `0` to disable background workers.
- `HOOP_UPDATE_WORKER_BATCH_SIZE`: optional update-worker batch size.

Legacy Transmission environment variables (`TRANSMISSION_BASE_URL`, `TRANSMISSION_USERNAME`, and `TRANSMISSION_PASSWORD`) remain fallback configuration. Current integration settings, tracker credentials, download paths, notification settings, and sync interval are persisted in SQLite through the settings feature.

The `cleanEmptySeriesDirectories` setting enables daily empty-directory cleanup. It defaults to disabled after migration. Cleanup and permission tests require an absolute Series Directory path that is not a filesystem root.

Client builds use `VITE_BACKEND_URL`; an empty value selects same-origin API and auth requests. Discover calls the dedicated `https://hoop-tmdb-api.defnone.workers.dev` Worker. The TMDB proxy requires the Cloudflare `TMDB_API_TOKEN` secret and `RATE_LIMITER` binding. Set the token with `cd trakt-proxy && bunx wrangler secret put TMDB_API_TOKEN --config wrangler.tmdb.jsonc`; do not declare it as a plaintext Wrangler variable.

TMDB API usage is free for non-commercial applications only when the required TMDB attribution is shown. Use the approved TMDB logo and the notice that the application uses TMDB and is not endorsed, certified, or approved by TMDB. Commercial use requires a separate written agreement and commercial API key.

Never commit real secret values. Keep authentication secrets, tracker credentials, torrent-client credentials, Telegram credentials, and `TMDB_API_TOKEN` in deployment secret storage or local ignored environment files.

## Development and validation

- `bun run dev`: run local workspaces through Overmind.
- `bun run dev:tmdb`: run the TMDB proxy Worker from its legacy `trakt-proxy` directory.
- `bun run build`: build shared, client, and server packages.
- `bun run build:single`: create the production single-origin artifact.
- `bun run lint`: lint and type-check configured workspaces.
- `bun run test`: run Vitest with V8 coverage for server, client, shared, and the TMDB proxy.

## Deployment and operations

The Docker image uses Bun 1.3 in builder and runtime stages. Runtime listens on port `3000`, stores SQLite data below `/app/build/data`, and expects media paths to be mounted into the container. Run the container with a non-root numeric `PUID` and `PGID` matching host filesystem ownership.

Standard deployment uses the published image referenced by `docker-compose.yml`. Persist the data directory, mount media/download storage, configure required environment values, then run `docker compose up -d`. Upgrade with an image pull and container recreation. Database migrations run automatically before HTTP startup.

Operational checks:

- Use `/api/health` for service health.
- Inspect application logs and the event journal for worker failures.
- Before enabling Series Directory cleanup, run the write-and-delete test in settings and verify the mounted path. Cleanup scans recursively, so very large directory trees add filesystem I/O once per day.
- For file-copy failures, fix the reported path, permission, source-file, or filesystem issue and leave the torrent available. The worker retries automatically according to its persisted backoff schedule; no service restart is required.
- Back up the SQLite data directory before risky upgrades or manual database work.
- Keep media and download paths on compatible storage when link-based file placement is expected.
- Disable workers with `HONO_WORKERS=0` for maintenance or isolated API diagnostics.

The TMDB proxy deploys independently with Wrangler after reviewed bindings and the `TMDB_API_TOKEN` secret are configured.
