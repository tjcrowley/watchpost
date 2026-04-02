import { type FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { query, queryOne } from "../db/client.js";
import type { User, LoginRequest, LoginResponse } from "@watchpost/types";

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/login
  app.post<{ Body: LoginRequest }>("/login", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    const user = await queryOne<User>(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({
      id: user.id,
      site_id: user.site_id,
      email: user.email,
      role: user.role,
    });

    const { password_hash: _, ...safeUser } = user;

    const response: LoginResponse = { token, user: safeUser };
    return reply.send(response);
  });

  // POST /api/auth/logout
  app.post("/logout", async (_request, reply) => {
    // JWT is stateless — client discards the token
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  app.get("/me", {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const { id } = request.user as { id: string };

      const user = await queryOne<User>(
        "SELECT id, site_id, email, role, created_at FROM users WHERE id = $1",
        [id]
      );

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      return reply.send(user);
    },
  });
};
