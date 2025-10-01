# Changelog

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
