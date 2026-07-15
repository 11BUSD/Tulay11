/**
 * Server-only data access — a thin `pg`-Pool-backed query interface for API
 * routes and lib code.
 *
 * The Supabase env in local/dev is a placeholder, so server data access is
 * backed by a raw `pg` Pool on `DATABASE_URL` rather than supabase-js. This
 * mirrors the test harness (`src/test/db.ts`) so lib code written against
 * `ServiceDb` runs identically in production routes and in integration tests.
 *
 * Design notes:
 *   - Lazy init: importing this module never connects; the pool is created on
 *     first use, and only then is `DATABASE_URL` required (never crash at
 *     import without env).
 *   - `ServiceDb` is the interface API routes and helpers depend on. It exposes
 *     `query` and `transaction`. A transaction hands the callback a `ServiceDb`
 *     bound to a single checked-out client, so callers (e.g. `recordAudit`) can
 *     write the audit row in the SAME transaction as the state change.
 */
import { Pool, type PoolClient } from "pg";

/**
 * The query interface server code depends on. `transaction` runs `fn` inside a
 * BEGIN/COMMIT (ROLLBACK on throw), passing a `ServiceDb` that routes every
 * query through the same client so all writes are atomic together.
 */
export interface ServiceDb {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction<T>(fn: (tx: ServiceDb) => Promise<T>): Promise<T>;
}

let pool: Pool | undefined;

/** Lazily-created singleton pool on DATABASE_URL. */
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

/** Wrap a `pg` queryable (Pool or PoolClient) as a `ServiceDb`. */
export function wrapServiceDb(queryable: Pool | PoolClient): ServiceDb {
  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<T[]> {
      const result = await queryable.query(text, params as never[]);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: ServiceDb) => Promise<T>): Promise<T> {
      // Already on a dedicated client (nested transaction): reuse it rather
      // than opening a second connection — keeps everything atomic.
      if ("release" in queryable) {
        return fn(wrapServiceDb(queryable));
      }
      const client = await (queryable as Pool).connect();
      try {
        await client.query("begin");
        const out = await fn(wrapServiceDb(client));
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/** Return the process-wide `ServiceDb` backed by the pool. */
export function getServiceDb(): ServiceDb {
  return wrapServiceDb(getPool());
}

/**
 * Convenience: run a query against the default pool. Prefer `getServiceDb()` in
 * new code; kept for call sites that only need a one-off read.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  return getServiceDb().query<T>(text, params);
}

/** Closes the pool — useful in test teardown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
