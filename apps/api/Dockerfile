FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS development
COPY package.json ./
RUN pnpm install
COPY . .
CMD ["npx", "tsx", "watch", "src/app.ts"]

FROM base AS build
COPY package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3001
CMD ["node", "dist/app.js"]
