import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import { getPresignedUrl } from "../minio/client.js";

interface AuthUser {
  userId: string;
  siteId: string;
  role: string;
  email: string;
}

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // All events routes require JWT
  app.addHook("onRequest", async (request, reply) => {
    await request.jwtVerify();
  });

  // GET /api/events — paginated, filterable, LEFT JOIN subjects for match_name
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      camera_id?: string;
      status?: string;
      from?: string;
      to?: string;
    };
  }>("/", async (request, reply) => {
    const user = request.user as AuthUser;
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "25", 10)));
    const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10));

    const conditions: string[] = ["e.site_id = $1"];
    const params: unknown[] = [user.siteId];

    if (request.query.camera_id) {
      params.push(request.query.camera_id);
      conditions.push(`e.camera_id = $${params.length}`);
    }

    if (request.query.status) {
      params.push(request.query.status);
      conditions.push(`e.review_status = $${params.length}`);
    }

    if (request.query.from) {
      params.push(request.query.from);
      conditions.push(`e.detected_at >= $${params.length}`);
    }

    if (request.query.to) {
      params.push(request.query.to);
      conditions.push(`e.detected_at <= $${params.length}`);
    }

    const where = conditions.join(" AND ");

    const [rows, countResult] = await Promise.all([
      query(
        `SELECT e.*, s.display_name AS match_name
         FROM detection_events e
         LEFT JOIN subjects s ON e.match_subject_id = s.id
         WHERE ${where}
         ORDER BY e.detected_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM detection_events e WHERE ${where}`,
        params,
      ),
    ]);

    return reply.send({
      data: rows,
      total: parseInt(countResult?.count ?? "0", 10),
      limit,
      offset,
    });
  });

  // GET /api/events/:id — full row + presigned URLs
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;

    const event = await queryOne(
      `SELECT e.*, s.display_name AS match_name, s.list_type AS match_list_type
       FROM detection_events e
       LEFT JOIN subjects s ON e.match_subject_id = s.id
       WHERE e.id = $1 AND e.site_id = $2`,
      [request.params.id, user.siteId],
    );

    if (!event) {
      return reply.code(404).send({ error: "Event not found" });
    }

    const result: Record<string, unknown> = { ...event };

    if (event.snapshot_path) {
      result.snapshot_url = await getPresignedUrl(event.snapshot_path as string);
    }
    if (event.best_face_crop) {
      result.best_face_crop_url = await getPresignedUrl(event.best_face_crop as string);
    }

    return reply.send(result);
  });

  // PATCH /api/events/:id/review
  app.patch<{ Params: { id: string }; Body: { review_status: string } }>(
    "/:id/review",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { review_status } = request.body;

      if (!["confirmed", "dismissed"].includes(review_status)) {
        return reply.code(400).send({ error: "review_status must be 'confirmed' or 'dismissed'" });
      }

      const event = await queryOne(
        `UPDATE detection_events
         SET review_status = $1, reviewed_by = $2, reviewed_at = now()
         WHERE id = $3 AND site_id = $4
         RETURNING *`,
        [review_status, user.userId, request.params.id, user.siteId],
      );

      if (!event) {
        return reply.code(404).send({ error: "Event not found" });
      }

      await query(
        `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.siteId, user.userId, "event.review", event.id, JSON.stringify({ review_status }), request.ip],
      );

      return reply.send(event);
    },
  );
};
