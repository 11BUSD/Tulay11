import { Pool } from "pg";

/**
 * Lazily-created singleton Postgres pool for raw-SQL access from server code
 * (used by data-model tasks and the test harness). Importing this module never
 * connects; the pool is built on first `getPool()` call. Returns `null`-safe
 * behavior by throwing only when DATABASE_URL is genuinely required.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(text, params as never[]);
  return result.rows as T[];
}

/** Closes the pool — useful in test teardown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
