import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/** Execute a parameterised query and return rows. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** Execute a parameterised query and return the first row or null. */
export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Tagged template literal for SQL queries.
 *
 * Usage:
 *   const rows = await sql<User>`SELECT * FROM users WHERE id = ${userId}`;
 */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  return query<T>(text, values);
}

/**
 * Read and execute migration files from ../../infra/migrations/ in filename order.
 * Uses an idempotent _migrations tracking table so each file runs at most once.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = join(
    fileURLToPath(import.meta.url),
    "..",  // db/
    "..",  // src/
    "..",  // apps/api/
    "..",  // apps/
    "..",  // project root
    "infra",
    "migrations",
  );

  // Ensure tracking table exists
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  for (const file of sqlFiles) {
    const already = await queryOne<{ filename: string }>(
      "SELECT filename FROM _migrations WHERE filename = $1",
      [file],
    );
    if (already) continue;

    const content = await readFile(join(migrationsDir, file), "utf-8");
    await query(content);
    await query("INSERT INTO _migrations (filename) VALUES ($1)", [file]);
    console.log(`Migration applied: ${file}`);
  }
}

/** Gracefully close the pool. */
export async function shutdown(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { getPool };
