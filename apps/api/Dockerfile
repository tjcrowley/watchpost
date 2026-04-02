FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --filter @watchpost/api... --no-frozen-lockfile
WORKDIR /app/apps/api
RUN pnpm build

FROM base AS production
WORKDIR /app
# Use pnpm deploy to get a flat, self-contained node_modules
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/logger/dist ./packages/logger/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
RUN pnpm install --filter @watchpost/api --prod --no-frozen-lockfile
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/app.js"]
