import { type FastifyPluginAsync } from "fastify";
import { query, queryOne } from "../db/client.js";
import type { Alert, PaginatedResponse, AuthUser } from "@watchpost/types";

export const alertsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    await request.jwtVerify();
  });

  // GET /api/alerts
  app.get<{ Querystring: { page?: string; limit?: string; status?: string } }>(
    "/",
    async (request, reply) => {
      const user = request.user as AuthUser;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "25", 10)));
      const offset = (page - 1) * limit;

      const conditions: string[] = [
        "e.site_id = $1",
      ];
      const params: unknown[] = [user.site_id];

      if (request.query.status) {
        params.push(request.query.status);
        conditions.push(`a.status = $${params.length}`);
      }

      const whereClause = conditions.join(" AND ");

      const [alerts, countResult] = await Promise.all([
        query<Alert>(
          `SELECT a.* FROM alerts a
           JOIN detection_events e ON a.detection_event_id = e.id
           WHERE ${whereClause}
           ORDER BY a.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM alerts a
           JOIN detection_events e ON a.detection_event_id = e.id
           WHERE ${whereClause}`,
          params
        ),
      ]);

      const total = parseInt(countResult?.count ?? "0", 10);

      const response: PaginatedResponse<Alert> = {
        data: alerts,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      };

      return reply.send(response);
    }
  );

  // GET /api/alerts/:id
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as AuthUser;

    const alert = await queryOne<Alert>(
      `SELECT a.* FROM alerts a
       JOIN detection_events e ON a.detection_event_id = e.id
       WHERE a.id = $1 AND e.site_id = $2`,
      [request.params.id, user.site_id]
    );

    if (!alert) {
      return reply.code(404).send({ error: "Alert not found" });
    }

    return reply.send(alert);
  });
};
