FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm install --no-frozen-lockfile
WORKDIR /app/apps/worker
RUN pnpm build

FROM node:20-slim AS production
WORKDIR /app/apps/worker
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/apps/worker/package.json ./package.json
CMD ["node", "dist/protect/connector.js"]
