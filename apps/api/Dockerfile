FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
# Copy workspace root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm install --filter @watchpost/api... --no-frozen-lockfile
WORKDIR /app/apps/api
RUN pnpm build

FROM base AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/app.js"]
