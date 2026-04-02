import https from "https";
import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import type { Camera } from "@watchpost/types";

const PROTECT_HOST = (process.env.PROTECT_URL ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const PROTECT_USERNAME = process.env.PROTECT_USERNAME ?? "";
const PROTECT_PASSWORD = process.env.PROTECT_PASSWORD ?? "";
const protectAgent = new https.Agent({ rejectUnauthorized: false });

/** Cached Protect auth session */
let protectAuth: { cookie: string; csrfToken: string; expiresAt: number } | null = null;

async function getProtectAuth(): Promise<{ cookie: string; csrfToken: string }> {
  if (protectAuth && Date.now() < protectAuth.expiresAt) {
    return protectAuth;
  }

  const body = JSON.stringify({
    username: PROTECT_USERNAME,
    password: PROTECT_PASSWORD,
    rememberMe: true,
    token: "",
  });

  const res = await new Promise<{ status: number; cookie: string; csrfToken: string }>((resolve, reject) => {
    const req = https.request(
      {
        hostname: PROTECT_HOST,
        port: 443,
        path: "/api/auth/login",
        method: "POST",
        agent: protectAgent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
          }
          resolve({
            status: res.statusCode ?? 0,
            cookie: headers["set-cookie"]?.split(";")[0] ?? "",
            csrfToken: headers["x-updated-csrf-token"] ?? headers["x-csrf-token"] ?? "",
          });
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (res.status !== 200 || !res.cookie || !res.csrfToken) {
    throw new Error(`Protect login failed: HTTP ${res.status}`);
  }

  protectAuth = { cookie: res.cookie, csrfToken: res.csrfToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  return protectAuth;
}

interface JwtUser {
  userId: string;
  siteId: string;
  role: string;
  email: string;
}

export const camerasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    await request.jwtVerify();
  });

  // GET /api/cameras
  app.get("/", async (request, reply) => {
    const user = request.user as JwtUser;

    const cameras = await query<Camera>(
      "SELECT * FROM cameras WHERE site_id = $1 ORDER BY name",
      [user.siteId]
    );

    return reply.send(cameras);
  });

  // GET /api/cameras/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as JwtUser;

    const camera = await queryOne<Camera>(
      "SELECT * FROM cameras WHERE id = $1 AND site_id = $2",
      [request.params.id, user.siteId]
    );

    if (!camera) {
      return reply.code(404).send({ error: "Camera not found" });
    }

    return reply.send(camera);
  });

  // PATCH /api/cameras/:id
  app.patch<{
    Params: { id: string };
    Body: { name?: string; enabled?: boolean; zone_config?: Record<string, unknown> };
  }>("/:id", async (request, reply) => {
    const user = request.user as JwtUser;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Admin role required" });
    }

    const { id } = request.params;
    const { name, enabled, zone_config } = request.body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIdx++}`);
      values.push(name);
    }
    if (enabled !== undefined) {
      fields.push(`enabled = $${paramIdx++}`);
      values.push(enabled);
    }
    if (zone_config !== undefined) {
      fields.push(`zone_config = $${paramIdx++}`);
      values.push(JSON.stringify(zone_config));
    }

    if (fields.length === 0) {
      return reply.code(400).send({ error: "No fields to update" });
    }

    values.push(id, user.siteId);
    const camera = await queryOne<Camera>(
      `UPDATE cameras SET ${fields.join(", ")}
       WHERE id = $${paramIdx++} AND site_id = $${paramIdx}
       RETURNING *`,
      values
    );

    if (!camera) {
      return reply.code(404).send({ error: "Camera not found" });
    }

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.siteId, user.userId, "camera.update", id, JSON.stringify(request.body), request.ip]
    );

    return reply.send(camera);
  });

  // POST /api/cameras/sync — Trigger camera sync from Protect
  app.post("/sync", async (request, reply) => {
    const user = request.user as JwtUser;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Admin role required" });
    }

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, ip)
       VALUES ($1, $2, $3, $4)`,
      [user.siteId, user.userId, "cameras.sync", request.ip]
    );

    return reply.send({ ok: true, message: "Camera sync initiated" });
  });

  // GET /api/cameras/:id/snapshot — Proxy live snapshot from Protect
  app.get<{ Params: { id: string } }>("/:id/snapshot", async (request, reply) => {
    const user = request.user as JwtUser;

    if (!PROTECT_HOST) {
      return reply.code(503).send({ error: "Protect URL not configured" });
    }

    const camera = await queryOne<Camera>(
      "SELECT * FROM cameras WHERE id = $1 AND site_id = $2",
      [request.params.id, user.siteId]
    );

    if (!camera) {
      return reply.code(404).send({ error: "Camera not found" });
    }

    const auth = await getProtectAuth();

    const snapBuf = await new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const req = https.request(
        {
          hostname: PROTECT_HOST,
          port: 443,
          path: `/proxy/protect/api/cameras/${camera.protect_id}/snapshot?ts=${Date.now()}`,
          method: "GET",
          agent: protectAgent,
          headers: { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => { chunks.push(chunk); });
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });

    if (snapBuf.status !== 200) {
      // Invalidate cached auth on 401
      if (snapBuf.status === 401) protectAuth = null;
      return reply.code(snapBuf.status).send({ error: "Failed to fetch snapshot from Protect" });
    }

    return reply
      .header("Content-Type", "image/jpeg")
      .header("Cache-Control", "no-store")
      .send(snapBuf.body);
  });
};
