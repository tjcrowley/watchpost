# ── Stage 1: Install dependencies (cached when manifests unchanged) ──
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.4
WORKDIR /app

COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: Build (invalidated when source changes) ──
FROM deps AS builder

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @watchpost/types build
RUN pnpm --filter @watchpost/logger build
RUN pnpm --filter @watchpost/db build

WORKDIR /app/apps/api
RUN pnpm build

# ── Stage 3: Production ──
FROM node:20-slim AS production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/app.js"]
