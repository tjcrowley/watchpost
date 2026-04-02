FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --filter @watchpost/web... --no-frozen-lockfile
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
WORKDIR /app/apps/web
EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["pnpm", "start"]
