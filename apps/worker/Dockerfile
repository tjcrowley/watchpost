FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm install --filter @watchpost/worker... --no-frozen-lockfile
WORKDIR /app/apps/worker
RUN pnpm build

FROM base AS production
WORKDIR /app
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/logger/dist ./packages/logger/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
RUN pnpm install --filter @watchpost/worker --prod --no-frozen-lockfile
WORKDIR /app/apps/worker
CMD ["node", "dist/protect/connector.js"]
