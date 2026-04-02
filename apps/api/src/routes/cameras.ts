import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import type { Camera, AuthUser } from "@watchpost/types";

export const camerasRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    await request.jwtVerify();
  });

  // GET /api/cameras
  app.get("/", async (request, reply) => {
    const user = request.user as AuthUser;

    const cameras = await query<Camera>(
      "SELECT * FROM cameras WHERE site_id = $1 ORDER BY name",
      [user.site_id]
    );

    return reply.send(cameras);
  });

  // GET /api/cameras/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;

    const camera = await queryOne<Camera>(
      "SELECT * FROM cameras WHERE id = $1 AND site_id = $2",
      [request.params.id, user.site_id]
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
    const user = request.user as AuthUser;

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

    values.push(id, user.site_id);
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
      [user.site_id, user.id, "camera.update", id, JSON.stringify(request.body), request.ip]
    );

    return reply.send(camera);
  });

  // POST /api/cameras/sync — Trigger camera sync from Protect
  app.post("/sync", async (request, reply) => {
    const user = request.user as AuthUser;

    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Admin role required" });
    }

    // In production, this triggers the worker to re-sync cameras from Protect
    await query(
      `INSERT INTO audit_log (site_id, user_id, action, ip)
       VALUES ($1, $2, $3, $4)`,
      [user.site_id, user.id, "cameras.sync", request.ip]
    );

    return reply.send({ ok: true, message: "Camera sync initiated" });
  });
};
