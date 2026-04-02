import { type FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { query, queryOne } from "../db/client.js";

interface User {
  id: string;
  site_id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/login
  app.post<{ Body: { email: string; password: string } }>("/login", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    const user = await queryOne<User>("SELECT * FROM users WHERE email = $1", [email]);

    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = app.jwt.sign({
      userId: user.id,
      siteId: user.site_id,
      role: user.role,
      email: user.email,
    });

    const { password_hash: _, ...safeUser } = user;
    return reply.send({ token, user: safeUser });
  });

  // GET /api/auth/me
  app.get("/me", async (request, reply) => {
    await request.jwtVerify();

    const { userId } = request.user as { userId: string };
    const user = await queryOne<User>(
      "SELECT id, site_id, email, role, created_at FROM users WHERE id = $1",
      [userId],
    );

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send(user);
  });

  // POST /api/auth/logout
  app.post("/logout", async (_request, reply) => {
    return reply.send({ ok: true });
  });
};
