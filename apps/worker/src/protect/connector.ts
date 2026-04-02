/* eslint-disable @typescript-eslint/no-explicit-any */
import https from "https";
import Redis from "ioredis";
import WebSocket from "ws";
import { createLogger } from "@watchpost/logger";
import { getPool, getQueue } from "@watchpost/db";
import { processEvent } from "../pipeline/processor.js";

const logger = createLogger("protect-connector");

const PROTECT_HOST = (process.env.PROTECT_URL ?? "192.168.1.1")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const PROTECT_USERNAME = process.env.PROTECT_USERNAME ?? "";
const PROTECT_PASSWORD = process.env.PROTECT_PASSWORD ?? "";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const agent = new https.Agent({ rejectUnauthorized: false });

async function apiRequest(opts: {
  method: string;
  path: string;
  body?: object;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const req = https.request(
      {
        hostname: PROTECT_HOST,
        port: 443,
        path: opts.path,
        method: opts.method,
        agent,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          }
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data), headers });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data, headers });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(): Promise<{ cookie: string; csrfToken: string }> {
  const res = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    body: { username: PROTECT_USERNAME, password: PROTECT_PASSWORD, rememberMe: true, token: "" },
  });

  if (res.status !== 200) {
    throw new Error(`Login failed: HTTP ${res.status} — ${JSON.stringify(res.body)}`);
  }

  const cookie = res.headers["set-cookie"]?.split(";")[0];
  const csrfToken = res.headers["x-updated-csrf-token"] ?? res.headers["x-csrf-token"];

  if (!cookie || !csrfToken) {
    throw new Error(`Login succeeded but missing cookie or CSRF token. Headers: ${JSON.stringify(res.headers)}`);
  }

  return { cookie, csrfToken };
}

async function getBootstrap(authHeaders: Record<string, string>): Promise<any> {
  const res = await apiRequest({
    method: "GET",
    path: "/proxy/protect/api/bootstrap",
    headers: authHeaders,
  });

  if (res.status !== 200) {
    throw new Error(`Bootstrap failed: HTTP ${res.status}`);
  }

  return res.body;
}

async function getSiteId(): Promise<string> {
  const pool = getPool();
  const result = await pool.query("SELECT id FROM sites LIMIT 1");
  if (result.rows.length === 0) throw new Error("No site configured.");
  return result.rows[0].id as string;
}

async function syncCameras(cameras: any[], siteId: string): Promise<void> {
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
  logger.info({ host: PROTECT_HOST }, "Connecting to UniFi Protect...");

  const { cookie, csrfToken } = await login();
  logger.info("Authenticated with UniFi Protect");

  const authHeaders = { Cookie: cookie, "X-CSRF-Token": csrfToken };

  const bootstrap = await getBootstrap(authHeaders);
  logger.info({ cameras: bootstrap.cameras?.length ?? 0 }, "Bootstrap complete");

  const siteId = await getSiteId();
  await syncCameras(bootstrap.cameras ?? [], siteId);

  // Connect to events WebSocket
  const wsUrl = `wss://${PROTECT_HOST}/proxy/protect/ws/updates?lastUpdateId=${bootstrap.lastUpdateId ?? ""}`;
  const ws = new WebSocket(wsUrl, {
    headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
    agent,
  });

  logger.info("Connecting to Protect events WebSocket...");

  const pool = getPool();
  const queue = await getQueue();
  const redis = new Redis(REDIS_URL);

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => { logger.info("Events WebSocket connected"); });

    ws.on("message", async (data: Buffer) => {
      try {
        // Protect sends binary update packets — try to parse as JSON first (some versions)
        let packet: any;
        try { packet = JSON.parse(data.toString()); } catch { return; } // binary packets need proper decoder

        if (!packet || packet.modelKey !== "event" || packet.action !== "add") return;
        if (!packet.payload || packet.payload.type !== "smartDetectZone") return;

        const smartTypes: string[] = packet.payload.smartDetectTypes ?? [];
        if (!smartTypes.includes("person")) return;

        logger.info({ camera: packet.payload.camera, id: packet.payload.id }, "Person detection");

        const camResult = await pool.query(
          "SELECT id FROM cameras WHERE protect_id = $1 AND site_id = $2",
          [packet.payload.camera, siteId]
        );

        if (camResult.rows.length === 0) {
          logger.warn({ camera: packet.payload.camera }, "Unknown camera, skipping");
          return;
        }

        await queue.send("detection-pipeline", {
          site_id: siteId,
          camera_id: camResult.rows[0].id,
          protect_event_id: packet.payload.id,
          event_type: packet.payload.type,
          detected_at: new Date(packet.payload.start).toISOString(),
          snapshot_base64: null,
        });
      } catch (err) {
        logger.error(err, "Error handling Protect event");
      }
    });

    ws.on("close", () => { logger.warn("WebSocket disconnected"); redis.quit(); resolve(); });
    ws.on("error", (err) => { logger.error(err, "WebSocket error"); redis.quit(); reject(err); });
  });
}

async function connectWithBackoff(): Promise<void> {
  let attempt = 0;
  const MAX_DELAY_MS = 30_000;
  const BASE_DELAY_MS = 1_000;
  let shutdownRequested = false;

  process.on("SIGINT", () => { shutdownRequested = true; process.exit(0); });
  process.on("SIGTERM", () => { shutdownRequested = true; process.exit(0); });

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
    }
  }
}

async function startPipelineWorker(): Promise<void> {
  const queue = await getQueue();
  await queue.work("detection-pipeline", async (jobs: any[]) => {
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

async function startConnector(): Promise<void> {
  logger.info("WatchPost Worker starting...");
  await new Promise((r) => setTimeout(r, 3000));
  await startPipelineWorker();
  await connectWithBackoff();
}

startConnector().catch((err: unknown) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
