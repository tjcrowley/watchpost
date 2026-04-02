import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { createLogger } from "@watchpost/logger";
import { shutdown } from "@watchpost/db";
import { authRoutes } from "./routes/auth.js";
import { watchlistRoutes } from "./routes/watchlist.js";
import { eventsRoutes } from "./routes/events.js";
import { camerasRoutes } from "./routes/cameras.js";
import { alertsRoutes } from "./routes/alerts.js";
import { wsHub } from "./ws/hub.js";

const logger = createLogger("api");

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

async function start() {
  // Plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    sign: { expiresIn: "24h" },
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  await app.register(websocket);

  // Auth decorator
  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  // Health check
  app.get("/health", async () => ({ status: "ok", service: "watchpost-api" }));

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(watchlistRoutes, { prefix: "/api/watchlist" });
  await app.register(eventsRoutes, { prefix: "/api/events" });
  await app.register(camerasRoutes, { prefix: "/api/cameras" });
  await app.register(alertsRoutes, { prefix: "/api/alerts" });

  // WebSocket
  await app.register(wsHub, { prefix: "/api/ws" });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      await app.close();
      await shutdown();
      process.exit(0);
    });
  }

  const port = parseInt(process.env.PORT ?? "3001", 10);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info(`WatchPost API running on port ${port}`);
}

start().catch((err) => {
  logger.error(err, "Failed to start API");
  process.exit(1);
});
