import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import type {
  DetectionEvent,
  EventsFilterRequest,
  ReviewEventRequest,
  PaginatedResponse,
  AuthUser,
} from "@watchpost/types";

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  // GET /api/events
  app.get<{ Querystring: EventsFilterRequest & Record<string, string> }>(
    "/",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const page = Math.max(1, parseInt(String(request.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(request.query.limit ?? "25"), 10)));
      const offset = (page - 1) * limit;

      const conditions: string[] = ["e.site_id = $1"];
      const params: unknown[] = [user.site_id];

      if (request.query.camera_id) {
        params.push(request.query.camera_id);
        conditions.push(`e.camera_id = $${params.length}`);
      }

      if (request.query.event_type) {
        params.push(request.query.event_type);
        conditions.push(`e.event_type = $${params.length}`);
      }

      if (request.query.review_status) {
        params.push(request.query.review_status);
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

      const whereClause = conditions.join(" AND ");

      const [events, countResult] = await Promise.all([
        query<DetectionEvent>(
          `SELECT e.* FROM detection_events e
           WHERE ${whereClause}
           ORDER BY e.detected_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM detection_events e WHERE ${whereClause}`,
          params
        ),
      ]);

      const total = parseInt(countResult?.count ?? "0", 10);

      const response: PaginatedResponse<DetectionEvent> = {
        data: events,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      };

      return reply.send(response);
    }
  );

  // GET /api/events/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;

    const event = await queryOne<DetectionEvent>(
      `SELECT e.*, s.display_name as match_display_name, s.list_type as match_list_type
       FROM detection_events e
       LEFT JOIN subjects s ON e.match_subject_id = s.id
       WHERE e.id = $1 AND e.site_id = $2`,
      [request.params.id, user.site_id]
    );

    if (!event) {
      return reply.code(404).send({ error: "Event not found" });
    }

    return reply.send(event);
  });

  // PATCH /api/events/:id/review
  app.patch<{ Params: { id: string }; Body: ReviewEventRequest }>(
    "/:id/review",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { review_status } = request.body;

      if (!["confirmed", "dismissed"].includes(review_status)) {
        return reply.code(400).send({ error: "review_status must be 'confirmed' or 'dismissed'" });
      }

      const event = await queryOne<DetectionEvent>(
        `UPDATE detection_events
         SET review_status = $1, reviewed_by = $2, reviewed_at = now()
         WHERE id = $3 AND site_id = $4
         RETURNING *`,
        [review_status, user.id, request.params.id, user.site_id]
      );

      if (!event) {
        return reply.code(404).send({ error: "Event not found" });
      }

      await query(
        `INSERT INTO audit_log (site_id, user_id, action, target, meta, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.site_id, user.id, "event.review", event.id, JSON.stringify({ review_status }), request.ip]
      );

      return reply.send(event);
    }
  );
};
