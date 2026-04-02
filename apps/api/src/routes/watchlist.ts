import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import { uploadBuffer } from "../minio/client.js";
import axios from "axios";
import { randomUUID } from "node:crypto";

interface AuthUser {
  userId: string;
  siteId: string;
  role: string;
  email: string;
}

export const watchlistRoutes: FastifyPluginAsync = async (app) => {
  // All watchlist routes require JWT
  app.addHook("onRequest", async (request, reply) => {
    await request.jwtVerify();
  });

  // GET /api/watchlist
  app.get<{ Querystring: { list_type?: string; active?: string } }>(
    "/",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const conditions: string[] = ["site_id = $1"];
      const params: unknown[] = [user.siteId];

      if (request.query.list_type) {
        params.push(request.query.list_type);
        conditions.push(`list_type = $${params.length}`);
      }

      if (request.query.active !== undefined) {
        params.push(request.query.active === "true");
        conditions.push(`active = $${params.length}`);
      }

      const rows = await query(
        `SELECT * FROM subjects WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
        params,
      );

      return reply.send(rows);
    },
  );

  // POST /api/watchlist
  app.post<{
    Body: {
      display_name: string;
      list_type: string;
      reason?: string;
      expires_at?: string;
      notes?: string;
    };
  }>("/", async (request, reply) => {
    const user = request.user as AuthUser;
    const { display_name, list_type, reason, expires_at, notes } = request.body;

    if (!display_name || !list_type) {
      return reply.code(400).send({ error: "display_name and list_type are required" });
    }

    const subject = await queryOne(
      `INSERT INTO subjects (site_id, display_name, list_type, reason, added_by, expires_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [user.siteId, display_name, list_type, reason ?? null, user.userId, expires_at ?? null, notes ?? null],
    );

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.siteId, user.userId, "subject.create", subject!.id, JSON.stringify({ list_type }), request.ip],
    );

    return reply.code(201).send(subject);
  });

  // GET /api/watchlist/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;

    const subject = await queryOne(
      "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
      [request.params.id, user.siteId],
    );

    if (!subject) {
      return reply.code(404).send({ error: "Subject not found" });
    }

    const enrollments = await query(
      "SELECT id, source_path, quality, created_at FROM face_enrollments WHERE subject_id = $1 ORDER BY created_at DESC",
      [request.params.id],
    );

    return reply.send({ ...subject, face_enrollments: enrollments });
  });

  // PATCH /api/watchlist/:id
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/:id",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params;
      const updates = request.body;

      const existing = await queryOne(
        "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
        [id, user.siteId],
      );

      if (!existing) {
        return reply.code(404).send({ error: "Subject not found" });
      }

      const allowedFields = ["display_name", "list_type", "reason", "expires_at", "active", "notes"];
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          fields.push(`${key} = $${paramIdx}`);
          values.push(value);
          paramIdx++;
        }
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" });
      }

      values.push(id);
      const subject = await queryOne(
        `UPDATE subjects SET ${fields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
        values,
      );

      await query(
        `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.siteId, user.userId, "subject.update", id, JSON.stringify(updates), request.ip],
      );

      return reply.send(subject);
    },
  );

  // DELETE /api/watchlist/:id — soft delete (set active=false)
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params;

    const subject = await queryOne(
      "UPDATE subjects SET active = false WHERE id = $1 AND site_id = $2 RETURNING id",
      [id, user.siteId],
    );

    if (!subject) {
      return reply.code(404).send({ error: "Subject not found" });
    }

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.siteId, user.userId, "subject.delete", id, request.ip],
    );

    return reply.code(204).send();
  });

  // POST /api/watchlist/:id/enroll — upload face photo, enroll via sidecar
  app.post<{ Params: { id: string } }>("/:id/enroll", async (request, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params;

    const subject = await queryOne(
      "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
      [id, user.siteId],
    );

    if (!subject) {
      return reply.code(404).send({ error: "Subject not found" });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Image file is required" });
    }

    const buffer = await file.toBuffer();
    const key = `enrollments/${id}/${randomUUID()}.jpg`;
    await uploadBuffer(key, buffer, file.mimetype);

    // Send base64 to face sidecar /enroll
    const sidecarUrl = process.env.FACE_SIDECAR_URL ?? "http://face-sidecar:5500";
    const response = await axios.post(`${sidecarUrl}/enroll`, {
      image: buffer.toString("base64"),
    });

    const { embedding, quality } = response.data as { embedding: number[]; quality: number };

    if (!embedding || embedding.length === 0) {
      return reply.code(422).send({ error: "No face detected in image" });
    }

    const embeddingStr = `[${embedding.join(",")}]`;

    const enrollment = await queryOne<{ id: string; quality: number }>(
      `INSERT INTO face_enrollments (subject_id, embedding, source_path, quality)
       VALUES ($1, $2, $3, $4)
       RETURNING id, quality`,
      [id, embeddingStr, key, quality],
    );

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.siteId, user.userId, "subject.enroll", id, JSON.stringify({ enrollment_id: enrollment!.id }), request.ip],
    );

    return reply.code(201).send({
      enrollment_id: enrollment!.id,
      quality: enrollment!.quality,
    });
  });
};
