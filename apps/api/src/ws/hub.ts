import { type FastifyPluginAsync } from "fastify";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const wsHub: FastifyPluginAsync = async (app) => {
  app.get("/events", { websocket: true }, (socket, _request) => {
    const subscriber = new Redis(REDIS_URL);

    subscriber.psubscribe("events:*", (err) => {
      if (err) {
        app.log.error(err, "Failed to psubscribe to events:*");
        socket.close();
        return;
      }
      app.log.info("WS client subscribed to events:*");
    });

    subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ channel, data: JSON.parse(message) }));
      }
    });

    socket.on("close", () => {
      app.log.info("WS client disconnected, cleaning up subscriber");
      subscriber.punsubscribe("events:*").then(() => subscriber.quit());
    });

    socket.on("error", (err: Error) => {
      app.log.error(err, "WebSocket error");
      subscriber.punsubscribe("events:*").then(() => subscriber.quit());
    });
  });
};
