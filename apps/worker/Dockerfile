FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm install --filter @watchpost/worker... --no-frozen-lockfile
WORKDIR /app/apps/worker
RUN pnpm build

FROM base AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
