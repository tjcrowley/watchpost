FROM node:20-slim AS builder
RUN npm install -g pnpm@9.15.4
WORKDIR /app

COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm install --no-frozen-lockfile
# Force worker to use root node_modules unifi-protect (v4), not its own v3
RUN rm -rf /app/apps/worker/node_modules/unifi-protect && \
    ln -s /app/node_modules/unifi-protect /app/apps/worker/node_modules/unifi-protect

# Build workspace packages first so their dist/ is available
RUN pnpm --filter @watchpost/types build
RUN pnpm --filter @watchpost/logger build
RUN pnpm --filter @watchpost/db build
WORKDIR /app/apps/worker
RUN rm -rf dist && pnpm build

# Production: keep full /app layout so workspace package resolution works
FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
WORKDIR /app/apps/worker
CMD ["node", "dist/protect/connector.js"]
