# ── Stage 1: Install dependencies (cached when manifests unchanged) ──
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.4
WORKDIR /app

COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: Build (invalidated when source changes) ──
FROM deps AS builder

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @watchpost/types build
RUN pnpm --filter @watchpost/logger build
RUN pnpm --filter @watchpost/db build

WORKDIR /app/apps/worker
RUN rm -rf dist && pnpm build

# ── Stage 3: Production ──
FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
WORKDIR /app/apps/worker
CMD ["node", "dist/protect/connector.js"]
