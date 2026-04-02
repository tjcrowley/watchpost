import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import { uploadBuffer } from "../minio/client.js";
import type {
  Subject,
  CreateSubjectRequest,
  UpdateSubjectRequest,
  PaginatedResponse,
  AuthUser,
} from "@watchpost/types";
import { randomUUID } from "node:crypto";

export const watchlistRoutes: FastifyPluginAsync = async (app) => {
  // All watchlist routes require auth
  app.addHook("onRequest", app.authenticate);

  // GET /api/watchlist
  app.get<{ Querystring: { page?: string; limit?: string; list_type?: string } }>(
    "/",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "25", 10)));
      const offset = (page - 1) * limit;

      let whereClause = "WHERE s.site_id = $1";
      const params: unknown[] = [user.site_id];

      if (request.query.list_type) {
        params.push(request.query.list_type);
        whereClause += ` AND s.list_type = $${params.length}`;
      }

      const [subjects, countResult] = await Promise.all([
        query<Subject>(
          `SELECT s.* FROM subjects s ${whereClause}
           ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM subjects s ${whereClause}`,
          params
        ),
      ]);

      const total = parseInt(countResult?.count ?? "0", 10);

      const response: PaginatedResponse<Subject> = {
        data: subjects,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      };

      return reply.send(response);
    }
  );

  // GET /api/watchlist/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;
    const subject = await queryOne<Subject>(
      "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
      [request.params.id, user.site_id]
    );

    if (!subject) {
      return reply.code(404).send({ error: "Subject not found" });
    }

    return reply.send(subject);
  });

  // POST /api/watchlist
  app.post<{ Body: CreateSubjectRequest }>("/", async (request, reply) => {
    const user = request.user as AuthUser;
    const { display_name, list_type, reason, expires_at, notes } = request.body;

    if (!display_name || !list_type) {
      return reply.code(400).send({ error: "display_name and list_type are required" });
    }

    const subject = await queryOne<Subject>(
      `INSERT INTO subjects (site_id, display_name, list_type, reason, added_by, expires_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.site_id, display_name, list_type, reason ?? null, user.id, expires_at ?? null, notes ?? null]
    );

    // Audit log
    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.site_id, user.id, "subject.create", subject!.id, JSON.stringify({ list_type }), request.ip]
    );

    return reply.code(201).send(subject);
  });

  // PATCH /api/watchlist/:id
  app.patch<{ Params: { id: string }; Body: UpdateSubjectRequest }>(
    "/:id",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params;
      const updates = request.body;

      const existing = await queryOne<Subject>(
        "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
        [id, user.site_id]
      );

      if (!existing) {
        return reply.code(404).send({ error: "Subject not found" });
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          fields.push(`${key} = $${paramIdx}`);
          values.push(value);
          paramIdx++;
        }
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: "No fields to update" });
      }

      values.push(id);
      const subject = await queryOne<Subject>(
        `UPDATE subjects SET ${fields.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
        values
      );

      await query(
        `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.site_id, user.id, "subject.update", id, JSON.stringify(updates), request.ip]
      );

      return reply.send(subject);
    }
  );

  // DELETE /api/watchlist/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params;

    const result = await queryOne<Subject>(
      "DELETE FROM subjects WHERE id = $1 AND site_id = $2 RETURNING id",
      [id, user.site_id]
    );

    if (!result) {
      return reply.code(404).send({ error: "Subject not found" });
    }

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.site_id, user.id, "subject.delete", id, request.ip]
    );

    return reply.code(204).send();
  });

  // POST /api/watchlist/:id/enroll — Upload face photo for enrollment
  app.post<{ Params: { id: string } }>("/:id/enroll", async (request, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params;

    const subject = await queryOne<Subject>(
      "SELECT * FROM subjects WHERE id = $1 AND site_id = $2",
      [id, user.site_id]
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

    // Send to face sidecar for embedding extraction
    const sidecarUrl = process.env.FACE_SIDECAR_URL ?? "http://face-sidecar:5500";
    const detectResponse = await fetch(`${sidecarUrl}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: buffer,
    });

    if (!detectResponse.ok) {
      return reply.code(422).send({ error: "Face detection failed" });
    }

    const detection = (await detectResponse.json()) as { faces: Array<{ embedding: number[]; quality: number }> };

    if (detection.faces.length === 0) {
      return reply.code(422).send({ error: "No face detected in image" });
    }

    const face = detection.faces[0];
    const embeddingStr = `[${face.embedding.join(",")}]`;

    const enrollment = await queryOne<{ id: string; quality: number }>(
      `INSERT INTO face_enrollments (subject_id, embedding, source_path, quality)
       VALUES ($1, $2, $3, $4)
       RETURNING id, quality`,
      [id, embeddingStr, key, face.quality]
    );

    await query(
      `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.site_id, user.id, "subject.enroll", id, JSON.stringify({ enrollment_id: enrollment!.id }), request.ip]
    );

    return reply.code(201).send({
      enrollment_id: enrollment!.id,
      quality: face.quality,
    });
  });
};
