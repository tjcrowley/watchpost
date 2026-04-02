import { ProtectApi } from "unifi-protect";
import Redis from "ioredis";
import { createLogger } from "@watchpost/logger";
import { getPool, getQueue } from "@watchpost/db";
import { processEvent } from "../pipeline/processor.js";

const logger = createLogger("protect-connector");

const PROTECT_URL = process.env.PROTECT_URL ?? "https://192.168.1.1";
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
  return result.rows[0].id;
}

async function syncCameras(siteId: string): Promise<void> {
  if (!protect) return;

  const bootstrap = await protect.getBootstrap();
  if (!bootstrap) {
    throw new Error("Failed to get Protect bootstrap");
  }

  logger.info({ cameras: bootstrap.cameras.length }, "Protect bootstrap loaded");

  const pool = getPool();
  for (const cam of bootstrap.cameras) {
    await pool.query(
      `INSERT INTO cameras (site_id, protect_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, protect_id) DO UPDATE SET name = $3`,
      [siteId, cam.id, cam.name]
    );
  }
  logger.info({ synced: bootstrap.cameras.length }, "Cameras synced");
}

async function subscribeToEvents(siteId: string): Promise<void> {
  if (!protect) return;

  const pool = getPool();
  const queue = await getQueue();

  protect.on("message", async (event: any) => {
    try {
      if (event.header?.modelKey !== "event") return;

      const payload = event.payload;
      if (!payload) return;

      // Only process smartDetectZone events (person detection)
      if (payload.type !== "smartDetectZone") return;

      // Check for person in smart detect types
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

      // Fetch snapshot JPEG from Protect API
      let snapshot: Buffer | null = null;
      try {
        snapshot = await protect!.getSnapshot(payload.camera, {
          width: 1920,
          height: 1080,
        });
        logger.debug({ camera: payload.camera, bytes: snapshot?.length }, "Snapshot fetched");
      } catch (err) {
        logger.error(err, "Failed to fetch snapshot");
      }

      // Enqueue for processing via pg-boss
      await queue.send("detection-pipeline", {
        site_id: siteId,
        camera_id: camResult.rows[0].id,
        protect_event_id: payload.id,
        event_type: payload.type,
        detected_at: new Date(payload.start).toISOString(),
        snapshot_base64: snapshot ? snapshot.toString("base64") : null,
      });
    } catch (err) {
      logger.error(err, "Error handling Protect event");
    }
  });

  logger.info("Subscribed to Protect smartDetectZone events");
}

async function connect(): Promise<void> {
  logger.info({ url: PROTECT_URL }, "Connecting to UniFi Protect...");

  protect = new ProtectApi();
  const loginSuccess = await protect.login(PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD);

  if (!loginSuccess) {
    throw new Error("Failed to authenticate with UniFi Protect");
  }

  logger.info("Authenticated with UniFi Protect");
  redis = new Redis(REDIS_URL);

  const siteId = await getSiteId();
  await syncCameras(siteId);
  await subscribeToEvents(siteId);
}

async function connectWithBackoff(): Promise<void> {
  let attempt = 0;
  const MAX_DELAY_MS = 30_000;
  const BASE_DELAY_MS = 1_000;

  while (!shutdownRequested) {
    try {
      await connect();
      attempt = 0; // reset on successful connection
      logger.info("Protect connection established");

      // Monitor for disconnects — the ProtectApi emits 'close' on WS disconnect
      await new Promise<void>((resolve) => {
        if (!protect) return resolve();
        protect.on("close" as any, () => {
          logger.warn("Protect WebSocket disconnected");
          resolve();
        });
      });

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
      // Clean up before reconnect
      if (protect) {
        try {
          protect.removeAllListeners();
        } catch {
          // ignore cleanup errors
        }
        protect = null;
      }
    }
  }
}

async function startPipelineWorker(): Promise<void> {
  const queue = await getQueue();

  await queue.work("detection-pipeline", async (job: any) => {
    const { snapshot_base64, ...eventData } = job.data;
    const snapshot = snapshot_base64 ? Buffer.from(snapshot_base64, "base64") : null;

    await processEvent({
      ...eventData,
      snapshot,
    });
  });

  logger.info("Pipeline worker started");
}

export async function startConnector(): Promise<void> {
  logger.info("WatchPost Worker starting...");

  // Start pipeline worker first so it's ready to process events
  await startPipelineWorker();

  // Connect to Protect with automatic reconnection
  // This runs in background — don't await it since it loops forever
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
      if (protect) {
        protect.removeAllListeners();
        protect = null;
      }
      process.exit(0);
    });
  }
}

// Auto-start when run directly
startConnector().catch((err) => {
  logger.error(err, "Worker failed to start");
  process.exit(1);
});
