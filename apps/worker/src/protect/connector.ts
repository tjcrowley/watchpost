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

async function getSiteId(): Promise<string> {
  const pool = getPool();
  const result = await pool.query("SELECT id FROM sites LIMIT 1");
  if (result.rows.length === 0) {
    throw new Error("No site configured. Create a site first.");
  }
  return result.rows[0].id;
}

async function connect(): Promise<void> {
  logger.info({ url: PROTECT_URL }, "Connecting to UniFi Protect...");

  protect = new ProtectApi();
  const loginSuccess = await protect.login(PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD);

  if (!loginSuccess) {
    throw new Error("Failed to authenticate with UniFi Protect");
  }

  logger.info("Authenticated with UniFi Protect");

  // Get bootstrap info (cameras, etc.)
  const bootstrap = await protect.getBootstrap();
  if (!bootstrap) {
    throw new Error("Failed to get Protect bootstrap");
  }

  logger.info({ cameras: bootstrap.cameras.length }, "Protect bootstrap loaded");

  const siteId = await getSiteId();

  // Sync cameras to database
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

  // Connect to events WebSocket
  redis = new Redis(REDIS_URL);
  const queue = await getQueue();

  protect.on("message", async (event: any) => {
    if (event.header?.modelKey !== "event") return;

    const payload = event.payload;
    if (!payload) return;

    // We care about smart detection events (person, vehicle, face, etc.)
    const eventTypes = ["smartDetectZone", "ring", "motion"];
    if (!eventTypes.includes(payload.type)) return;

    logger.info(
      { type: payload.type, camera: payload.camera, id: payload.id },
      "Protect event received"
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

    // Fetch snapshot from Protect
    let snapshot: Buffer | null = null;
    try {
      snapshot = await protect!.getSnapshot(payload.camera, {
        width: 1920,
        height: 1080,
      });
    } catch (err) {
      logger.error(err, "Failed to fetch snapshot");
    }

    // Enqueue for processing
    await queue.send("detection-pipeline", {
      site_id: siteId,
      camera_id: camResult.rows[0].id,
      protect_event_id: payload.id,
      event_type: payload.type,
      detected_at: new Date(payload.start).toISOString(),
      snapshot_base64: snapshot ? snapshot.toString("base64") : null,
    });
  });

  logger.info("Subscribed to Protect events");
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

async function main(): Promise<void> {
  logger.info("WatchPost Worker starting...");

  await connect();
  await startPipelineWorker();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      if (redis) await redis.quit();
      protect = null;
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error(err, "Worker failed");
  process.exit(1);
});
