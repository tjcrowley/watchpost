import { type FastifyPluginAsync } from "fastify";
import { type WebSocket } from "ws";
import Redis from "ioredis";
import { createLogger } from "@watchpost/logger";
import type { WsMessage } from "@watchpost/types";

const logger = createLogger("ws-hub");

const clients = new Set<WebSocket>();

let subscriber: Redis | null = null;

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

    subscriber.subscribe("watchpost:events", (err) => {
      if (err) {
        logger.error(err, "Failed to subscribe to Redis channel");
      } else {
        logger.info("Subscribed to watchpost:events");
      }
    });

    subscriber.on("message", (_channel: string, message: string) => {
      broadcast(message);
    });
  }
  return subscriber;
}

function broadcast(message: string): void {
  const dead: WebSocket[] = [];

  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    } else {
      dead.push(ws);
    }
  }

  for (const ws of dead) {
    clients.delete(ws);
  }
}

export const wsHub: FastifyPluginAsync = async (app) => {
  // Ensure subscriber is initialized
  getSubscriber();

  app.get("/", { websocket: true }, (socket, request) => {
    logger.info("WebSocket client connected");
    clients.add(socket);

    // Send welcome message
    const welcome: WsMessage = {
      type: "system",
      payload: { message: "Connected to WatchPost" },
      timestamp: new Date().toISOString(),
    };
    socket.send(JSON.stringify(welcome));

    socket.on("close", () => {
      clients.delete(socket);
      logger.info("WebSocket client disconnected");
    });

    socket.on("error", (err) => {
      logger.error(err, "WebSocket error");
      clients.delete(socket);
    });
  });
};

// Helper to publish events from other services
export async function publishEvent(event: WsMessage): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  await redis.publish("watchpost:events", JSON.stringify(event));
  await redis.quit();
}
