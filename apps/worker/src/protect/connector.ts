import { ProtectApi, ProtectApiUpdates } from "unifi-protect";
import type { ProtectNvrUpdatePayloadEventAdd } from "unifi-protect";
import Redis from "ioredis";
import { createLogger } from "@watchpost/logger";
import { getPool, getQueue } from "@watchpost/db";
import { processEvent } from "../pipeline/processor.js";

const logger = createLogger("protect-connector");

// v4 API: login() takes full URL
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
    throw new Error("No site configured.");
  }
  return result.rows[0].id as string;
}

async function syncCameras(api: ProtectApi, siteId: string): Promise<void> {
  const cameras = api.bootstrap?.cameras ?? [];
  logger.info({ cameras: cameras.length }, "Syncing cameras");

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

  protect = new ProtectApi();

  // v4: login(url, username, password)
  const loginOk = await protect.login(PROTECT_URL, PROTECT_USERNAME, PROTECT_PASSWORD);
  if (!loginOk) {
    throw new Error("Failed to authenticate with UniFi Protect");
  }
  logger.info("Authenticated with UniFi Protect");

  // v4: bootstrapController() fetches devices
  const bootstrapOk = await protect.bootstrapController();
  if (!bootstrapOk) {
    throw new Error("Failed to bootstrap Protect controller");
  }
  logger.info("Bootstrap complete");

  redis = new Redis(REDIS_URL);
  const siteId = await getSiteId();
  await syncCameras(protect, siteId);

  // v4: launchEventsWs() starts the events WebSocket
  const wsOk = await protect.launchEventsWs();
  if (!wsOk) {
    throw new Error("Failed to launch Protect events WebSocket");
  }
  logger.info("Events WebSocket started");

  const ws = protect.eventsWs;
  if (!ws) {
    throw new Error("eventsWs is null after launchEventsWs");
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

      logger.info({ type: payload.type, camera: payload.camera, id: payload.id }, "Person detection");

      const camResult = await pool.query(
        "SELECT id FROM cameras WHERE protect_id = $1 AND site_id = $2",
        [payload.camera, siteId]
      );

      if (camResult.rows.length === 0) {
        logger.warn({ camera: payload.camera }, "Unknown camera, skipping");
        return;
      }

      // Fetch snapshot
      let snapshotBase64: string | null = null;
      try {
        const snap = await protect!.getSnapshot(payload.camera);
        if (snap) snapshotBase64 = snap.toString("base64");
      } catch (err) {
        logger.warn(err, "Snapshot fetch failed");
      }

      await queue.send("detection-pipeline", {
        site_id: siteId,
        camera_id: camResult.rows[0].id,
        protect_event_id: payload.id,
        event_type: payload.type,
        detected_at: new Date(payload.start).toISOString(),
        snapshot_base64: snapshotBase64,
      });
    } catch (err) {
      logger.error(err, "Error handling Protect event");
    }
  });

  logger.info("Subscribed to Protect events");

  // Wait until WS closes
  await new Promise<void>((resolve) => {
    ws.on("close", () => { logger.warn("WebSocket disconnected"); resolve(); });
    ws.on("error", (err: Error) => { logger.error(err, "WebSocket error"); resolve(); });
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
      logger.info("Reconnecting...");
    } catch (err) {
      attempt++;
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      logger.error({ err, attempt, retryInMs: delay }, "Protect connection failed, retrying...");
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

  // Give postgres a moment to be fully ready
  await new Promise((r) => setTimeout(r, 3000));

  await startPipelineWorker();

  connectWithBackoff().catch((err: unknown) => {
    logger.error(err, "Fatal connector error");
    process.exit(1);
  });

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
