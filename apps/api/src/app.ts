import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { authRoutes } from "./routes/auth.js";
import { watchlistRoutes } from "./routes/watchlist.js";
import { eventsRoutes } from "./routes/events.js";
import { camerasRoutes } from "./routes/cameras.js";
import { alertsRoutes } from "./routes/alerts.js";
import { wsHub } from "./ws/hub.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  // Plugins
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
    sign: { expiresIn: "24h" },
  });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // Auth hook — skip /api/auth paths, health, and ws
  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url.startsWith("/api/auth") ||
      request.url === "/health" ||
      request.url.startsWith("/ws/")
    ) {
      return;
    }
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  // Health check
  app.get("/health", async () => ({ status: "ok", service: "watchpost-api" }));

  // Route plugins
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(watchlistRoutes, { prefix: "/api/watchlist" });
  await app.register(eventsRoutes, { prefix: "/api/events" });
  await app.register(camerasRoutes, { prefix: "/api/cameras" });
  await app.register(alertsRoutes, { prefix: "/api/alerts" });

  // WebSocket hub
  await app.register(wsHub, { prefix: "/ws" });

  return app;
}

export async function main(): Promise<void> {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? "3001", 10);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`WatchPost API listening on :${port}`);
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
