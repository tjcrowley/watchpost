import { Pool, type PoolConfig } from "pg";
import PgBoss from "pg-boss";

let pool: Pool | null = null;
let boss: PgBoss | null = null;

export function getPool(config?: PoolConfig): Pool {
  if (!pool) {
    pool = new Pool(
      config ?? {
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }
    );
  }
  return pool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      retryLimit: 3,
      retryDelay: 5,
      expireInHours: 23,  // pg-boss v10 max is < 24h
    });
    await boss.start();
  }
  return boss;
}

export async function shutdown(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { Pool, PgBoss };
