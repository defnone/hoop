###########
# Builder #
###########
FROM oven/bun:1.3 AS builder
WORKDIR /app
ENV NODE_ENV=production

# Copy package.json and bun.lockb
COPY package.json bun.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/
COPY trakt-proxy/package.json ./trakt-proxy/

# Install all dependencies for building (dev+prod)
RUN bun install --frozen-lockfile --ignore-scripts --linker=hoisted

COPY . .

ENV VITE_BACKEND_URL=''

# Single-build with external packages
RUN bun run build:single

############
# Runtime  #
############
FROM oven/bun:1.3 AS runner
ENV NODE_ENV=production
ENV DATABASE_URL=data/sqlite.db
ENV BETTER_AUTH_TELEMETRY=0

# Allow overriding user/group IDs at build time (e.g., via compose build args)
ARG PUID=1000
ARG PGID=1000

WORKDIR /app

## Copy single build and external deps
COPY --from=builder /app/build ./build

# Copy SQL migrations (used in production)
COPY --from=builder /app/server/src/db/migrations ./migrations


# Create data dir and fix permissions for target UID/GID
RUN mkdir -p /app/data \
  && chown -R "$PUID":"$PGID" /app

# Run as the specified numeric UID:GID (no need to create system user/group)
USER ${PUID}:${PGID}

EXPOSE 3000
CMD ["sh", "-lc", "cd build && exec bun --bun --smol server.js"]
