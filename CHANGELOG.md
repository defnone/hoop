# Changelog

## 0.7.1 - 2026-07-16

### Fixed

- Server: retry failed Transmission download starts after a cooldown and avoid duplicate failure journal entries.
- Server: preserve normalized Transmission errors as causes for clearer retry diagnostics.
- Server: retry alternative tracker domains when a fetched page cannot provide valid title data.

### Changed

- Client: simplify search filter state, torrent dialog actions, and related component state management.
- Client: improve torrent action accessibility labels and episode lookup performance.
- Client: remove unused UI components and dependencies.

### Tests

- Added coverage for download retry cooldowns, tracker title fallback, and normalized Transmission errors.
- Simplified Transmission adapter test setup.

### Notes

- No breaking changes expected.

## 0.7.0 - 2026-07-09

### Added

- Client: add Event Journal page for browsing worker and system events.
- Client: add Transmission transfers sheet with search, filters, speed summary, torrent actions, and removal flow.
- Client: add manual torrent sync status in the header.
- Client: allow searching by torrent title directly from the edit dialog.
- Server: add event journal storage, API routes, read-state support, and retention trimming.
- Server: add batched manual torrent sync endpoint.
- Server: add Transmission management API for listing, pausing, starting, stopping, and removing torrents.
- Server: add `kinozal.guru` as an alternative tracker domain.

### Changed

- Server: retry tracker-data fetches across alternative domains after timeout.
- Server: use the active tracker URL for authentication and fetching.
- Server: retry FlareSolverr challenge solves on timeout and report invalid JSON responses more clearly.
- Server: process update-worker items in batches for better reliability under larger queues.
- Server: normalize Transmission errors so worker failures surface cleaner diagnostics.
- Server: use safer link-or-copy file handling for tracked episode copies.
- Client: polish settings labels, sync messages, layouts, and React runtime patterns.

### Security

- Server: redact sensitive URL values in outbound fetch logging.
- Build: exclude private keys, certificates, local SQLite databases, backups, and env-like secrets from Docker context.
- Server: make first-user signup transactional to prevent duplicate initial account creation.
- Server: allow auth base URL configuration through environment.

### Build/Infra

- Updated client dependencies, including React, React Router, TanStack Query, Tailwind, Radix UI, Vite, and related tooling.
- Updated server dependencies, including Hono, Better Auth, Drizzle, Transmission client packages, and HTML parsing tooling.
- Updated baseline browser data and added an override to prevent stale browser mapping warnings.
- Migrated Vite React plugin setup for the refreshed frontend toolchain.
- Added Prettier single-quote defaults and formatted the project.

### Tests

- Added coverage for Event Journal repo/service/routes.
- Added coverage for Transmission sheet utilities and management routes.
- Added coverage for FlareSolverr retries, invalid JSON handling, tracker fallback, URL redaction, file copy helpers, signup locking, and sync routes.

### Notes

- Includes new SQLite migrations for Event Journal tables, state, and notification flags.
- No breaking changes expected.

## 0.6.0 - 2026-06-22

### Added

- Client: add FlareSolverr settings for Cloudflare bypass enablement, server URL, timeout, and connection checks.
- Server: add FlareSolverr verification and tracker fallback support for Cloudflare challenge pages.

### Build/Infra

- Added SQLite migrations for persisted FlareSolverr settings.

## 0.5.7 - 2026-06-22

### Changed

- Server: support episode labels in tracker titles.
- Server: expand tracker host matching for rutracker domains.

### Build/Infra

- Updated Vitest and V8 coverage tooling to 4.1.9 across test workspaces.

## 0.5.6 - 2026-06-17

### Security

- Updated Hono to 4.12.25 across the root workspace, server, and Trakt proxy.
- Updated Better Auth to 1.6.18 across the server and client workspaces.

### Build/Infra

- Synced Bun lockfiles for the dependency security update.

## 0.5.5 - 2026-05-12

### Security

- Updated Hono to 4.12.18 across the root workspace, server, and Trakt proxy to include upstream CVE fixes published since the 0.5.4 release (1ba33a0).

### Build/Infra

- Synced Hono lockfile entries so all workspaces resolve the patched Hono version consistently.

## 0.5.4 - 2026-03-27

### Changed

- Trakt proxy: extracted watched-shows URL construction into a dedicated utility to keep request parameters centralized and easier to maintain.
- Trakt proxy: aligned rate-limiter middleware typing with the current Hono middleware signatures.

### Build/Infra

- Updated runtime and worker tooling used by the Trakt proxy, including Hono, hono-rate-limiter, Wrangler, Cloudflare worker types, and bun-types.

### Tests

- Added Vitest coverage for `getTraktData` and the watched-shows URL builder in `trakt-proxy`.

## 0.5.3 - 2026-03-07

### Security

- Updated Hono to 4.12.5 to include the latest upstream security fixes, including patches for recent Hono vulnerabilities addressed in the 4.11.x line.

### Fixed

- Improved episode parsing in Transmission and file-management helpers to support additional title and filename formats.

### Changed

- Tightened server-side validation typing and response handling for more consistent validation failures.
- Aligned Better Auth hook typing and simplified dashboard state/effect handling for more predictable internal behavior.

## 0.5.2 - 2025-11-13

### Added

- Client: enable `babel-plugin-react-compiler` to leverage the latest React compiler optimizations (22883af).

### Fixed

- Transmission/File management: extend episode parsing regexes to recognize additional delimiters across helpers (89b8314, 5d8ffac).

### Build/Infra

- Tooling: run `tsc --noEmit` inside lint scripts to surface type issues earlier (3cdf8ec).

### Tests

- Parsing: add coverage for `getEpisodeFromName` and `selectEpisodes` to prevent regressions in delimiter handling (98d5d08, f3a8bab).

## 0.5.1 - 2025-10-25

### Security

- Server: ship Hono upgrade with upstream patch for CVE-2025-62610 to ensure patched runtime in production.

## 0.5.0 - 2025-10-13

### Added

- Workers: add processing locks to prevent concurrent runs; persist error messages and expose via DTO for better diagnostics (de4f6ea, ee36003, 2dc352d, 32f401a).
- Client: surface worker error messages in torrent rows; improve tracking status handling (f904358, 32f401a).
- Search: add quality selection, new filters, input validation, and category info popover; support tooltip alignment (97a5e01, 03e8f02, ee5c6ee, c0f27af).

### Changed

- Reliability: ensure awaited repo updates to avoid race conditions; refine error handling and logging across workers/services, including Cloudflare challenge handling and timeout reporting (4afd2e9, 16e3a06, dfb708d, a16e13b, e0cf858, ec01876).
- Parsing: enhance episode/season detection for rutracker/nnmclub; sanitize filenames to reduce copy errors (022bd52, d895431, c2acc63, 99113df).
- UX: disable quality buttons while loading; skip multi-season items in search; responsive tooltip widths; dialog/layout/button polish (30f9c39, 7ca83a5, 8c34811, 3e7bb5e).

### Fixed

- Workers: avoid clearing persisted error messages; refine error clearing logic (ec01876, 58aa150).

### Build/Infra

- Build: add production flags/optimizations; update bun-types; pin @ctrl/shared-torrent; adjust bunfig settings (3077913, e1cd2aa, 104294f, 2e89cd0, 86a7f13).
- TypeScript: add tsconfig.app.json; include test files for stricter type checking (9265196, f0534d1).
- Docker: bump Bun to 1.3; simplify .dockerignore (ba1e970, 8257f95).

### Tests

- Workers: add tests for error persistence and mocks; enforce stricter typings; exclude type-only modules from coverage (35f37d1, 036dc7e, 92215ac, 9c8807e, 5fd89f0, bb333e9).

### Notes

- No breaking changes expected; TorrentItemDto extended with error details for better diagnostics.

## 0.4.0 - 2025-10-08

### Added

- client/server: add torrent pause toggle flow across UI and API (7609ba1)

### Changed

- server: rename tracked episodes helpers and improve mock signatures (42692d5, 1f0053d)
- client: refine dialogs and input styling with better error handling (b2bd0c3, fbf815b, 583d199)
- client: integrate torrent start fetch action in Header (b94c32a)
- server: switch logger to Winston and update build output to Bun target (40f19fd, 63f5653)
- docker: update Bun base version and entrypoint exec usage (13e1def, 4e5d882)
- server: use tiny Hono import for Jackett routes (118c5c5)

### Fixed

- server: correct control status typo to ensure accurate torrent status mapping (e7add27)

## 0.3.0 - 2025-10-01

### Added

- trakt-proxy: initial service and rate limit key resolution (80173bb, bb11e52)
- server: Zod validation handler for error responses (cabb55c)

### Changed

- server: improve validation and error handling; Zod-based jackett search; kinozal removal logic; min(1) check; regex for episode parsing; include raw title in errors; enforce minimum ID (b813065, 52f8e26, 018f877, 5792b37, 3c2c0ab, c41d88b, 53e4c26)
- client: improve error handling in getJackett; update Jackett configuration instructions; add response.statusText (279035f, 75f0395, 47313f6)
- trakt-proxy: bump hono and update .gitignore; dependency updates (f25038e, d44559e, 840aad9)
- tests: fix test error message check (d428d3c)
- infra: Docker bun version bump; add trakt-proxy package.json (ce938fb)
- misc: join messages from all issues; use error message from customFetch directly (cedacf6, a5e57a5)
- merges: #2 dev, #3 refactor-api, #4 bump-hono (3a15581, 9174f43, 256d62e)

## 0.2.1 - 2025-09-28

### Changed

- client: adjust TrackerLogo and TorrentTableData styling for improved layout
- client: refactor Header component and simplify Logo rendering
- client: refactor search parameter handling in SearchPage
- client: update Header navigation to include period parameter

## 0.2.0 - 2025-09-27

### Added

- client: Add Suspense loader and lazy load dashboard routes

### Changed

- client: Improve TorrentTable row styling and data display
- client: Update TorrentTableData.tsx
- docs: Update README with comparison to TorMon
- ci: Adjust workflow permissions to address code scanning alert

## 0.1.0 - 2025-09-25

- Initial release
