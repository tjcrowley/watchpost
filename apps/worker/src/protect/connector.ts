import { ProtectApi } from "unifi-protect";
import { ProtectApiUpdates, type ProtectNvrUpdatePayloadEventAdd } from "unifi-protect";
import Redis from "ioredis";
import { createLogger } from "@watchpost/logger";
import { getPool, getQueue } from "@watchpost/db";
import { processEvent } from "../pipeline/processor.js";

const logger = createLogger("protect-connector");

// ProtectApi v3 takes just the hostname/IP, not a full URL
const PROTECT_URL = (process.env.PROTECT_URL ?? "192.168.1.1")
  .replace(/^https?:\/\//, "")  // strip scheme if present
  .replace(/\/$/, "");           // strip trailing slash
const PROTECT_USERNAME = process.env.PROTECT_USERNAME ?? "";
const PROTECT_PASSWORD = process.env.PROTECT_PASSWORD ?? "";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let protect: ProtectApi | null = null;
let redis: Redis | null = null;
let shutdownRequested = false;

async function getSiteId(): Promise<string> {
  const pool = getPool();
  const result = await pool.query("SELECT id FROM sites LIMIT 1");
  if (result.rows.length === 0) {
    throw new Error("No site configured. Create a site first.");
  }
  return result.rows[0].id as string;
}

async function syncCameras(api: ProtectApi, siteId: string): Promise<void> {
  const cameras = api.cameras ?? [];
  logger.info({ cameras: cameras.length }, "Protect bootstrap loaded");

  const pool = getPool();
  for (const cam of cameras) {
    await pool.query(
      `INSERT INTO cameras (site_id, protect_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, protect_id) DO UPDATE SET name = $3`,
      [siteId, cam.id, cam.name]
    );
  }
  logger.info({ synced: cameras.length }, "Cameras synced");
}

async function connect(): Promise<void> {
  logger.info({ url: PROTECT_URL }, "Connecting to UniFi Protect...");

  // v3 API: constructor handles login
  protect = new ProtectApi(PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD);

  // Bootstrap / authenticate
  const ok = await protect.refreshDevices();
  if (!ok) {
    throw new Error("Failed to authenticate with UniFi Protect");
  }
  logger.info("Authenticated with UniFi Protect");

  redis = new Redis(REDIS_URL);
  const siteId = await getSiteId();
  await syncCameras(protect, siteId);

  // Attach to the events WebSocket
  const ws = protect.eventsWs;
  if (!ws) {
    throw new Error("Protect events WebSocket not available after bootstrap");
  }

  const pool = getPool();
  const queue = await getQueue();

  ws.on("message", async (data: Buffer) => {
    try {
      const packet = ProtectApiUpdates.decodeUpdatePacket(protect!.log, data);
      if (!packet) return;

      const action = packet.action;
      if (action.modelKey !== "event" || action.action !== "add") return;

      const payload = packet.payload as ProtectNvrUpdatePayloadEventAdd;
      if (!payload || payload.type !== "smartDetectZone") return;

      const smartTypes: string[] = payload.smartDetectTypes ?? [];
      if (!smartTypes.includes("person")) return;

      logger.info(
        { type: payload.type, camera: payload.camera, id: payload.id, smartTypes },
        "Person detection event received"
      );

      // Find the camera in our DB
      const camResult = await pool.query(
        "SELECT id FROM cameras WHERE protect_id = $1 AND site_id = $2",
        [payload.camera, siteId]
      );

      if (camResult.rows.length === 0) {
        logger.warn({ camera: payload.camera }, "Unknown camera, skipping");
        return;
      }

      // Enqueue for processing via pg-boss
      await queue.send("detection-pipeline", {
        site_id: siteId,
        camera_id: camResult.rows[0].id,
        protect_event_id: payload.id,
        event_type: payload.type,
        detected_at: new Date(payload.start).toISOString(),
        snapshot_base64: null, // v3 API snapshot fetch handled in processor
      });
    } catch (err) {
      logger.error(err, "Error handling Protect event");
    }
  });

  logger.info("Subscribed to Protect events WebSocket");

  // Wait until WS closes (disconnect)
  await new Promise<void>((resolve) => {
    ws.on("close", () => {
      logger.warn("Protect WebSocket disconnected");
      resolve();
    });
    ws.on("error", (err: Error) => {
      logger.error(err, "Protect WebSocket error");
      resolve();
    });
  });
}

async function connectWithBackoff(): Promise<void> {
  let attempt = 0;
  const MAX_DELAY_MS = 30_000;
  const BASE_DELAY_MS = 1_000;

  while (!shutdownRequested) {
    try {
      await connect();
      attempt = 0;
      if (shutdownRequested) return;
      logger.info("Reconnecting after disconnect...");
    } catch (err) {
      attempt++;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      logger.error(
        { err, attempt, retryInMs: delay },
        "Protect connection failed, retrying..."
      );
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      protect = null;
    }
  }
}

async function startPipelineWorker(): Promise<void> {
  const queue = await getQueue();

  await queue.work("detection-pipeline", async (jobs) => {
    for (const job of jobs) {
      const data = job.data as Record<string, unknown>;
      const { snapshot_base64, ...eventData } = data;
      const snapshot = snapshot_base64
        ? Buffer.from(snapshot_base64 as string, "base64")
        : null;

      await processEvent({
        ...(eventData as {
          site_id: string;
          camera_id: string;
          protect_event_id: string;
          event_type: string;
          detected_at: string;
        }),
        snapshot,
      });
    }
  });

  logger.info("Pipeline worker started");
}

export async function startConnector(): Promise<void> {
  logger.info("WatchPost Worker starting...");

  // Give postgres/pg-boss a moment to be fully ready
  await new Promise((r) => setTimeout(r, 3000));

  await startPipelineWorker();

  connectWithBackoff().catch((err) => {
    logger.error(err, "Fatal connector error");
    process.exit(1);
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      shutdownRequested = true;
      if (redis) await redis.quit();
      process.exit(0);
    });
  }
}

startConnector().catch((err: unknown) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
