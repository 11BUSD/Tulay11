/**
 * Integration-test database helper.
 *
 * Connects to `TEST_DATABASE_URL` (falling back to `DATABASE_URL`) so
 * integration suites can run raw SQL against a real Postgres. The global setup
 * (`src/test/global-setup.ts`) applies migrations + seed to this database once
 * before the suite runs.
 *
 * Later API/lib tasks can use `getTestPool()` for a raw `pg` client or
 * `getServiceQuery()` for a thin service-role-like `{ query }` interface that
 * mirrors how server routes talk to the database (service role bypasses RLS).
 */
import pg from "pg";
import { wrapServiceDb, type ServiceDb } from "@/lib/db/client";

/** Resolve the database URL used by integration tests. */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Neither TEST_DATABASE_URL nor DATABASE_URL is set for integration tests.",
    );
  }
  return url;
}

let pool: pg.Pool | undefined;

/** Lazily-created singleton pool pointed at the test database. */
export function getTestPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: getTestDatabaseUrl() });
  }
  return pool;
}

/** Run a query against the test database, returning the rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getTestPool().query(text, params as never[]);
  return result.rows as T[];
}

/**
 * A minimal service-role-like query interface. Server code uses the Supabase
 * service-role key which bypasses RLS; in tests the pool connects as the
 * Postgres superuser, which likewise bypasses RLS — so this is a faithful
 * stand-in for that access level.
 */
export interface ServiceQuery {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/** Return the service-role-like query interface backed by the test pool. */
export function getServiceQuery(): ServiceQuery {
  return { query };
}

/**
 * Return a full `ServiceDb` (query + transaction) backed by the test pool. Lib
 * code takes an injectable `ServiceDb`, so integration tests pass this so the
 * production code path runs against `TEST_DATABASE_URL`.
 */
export function getTestServiceDb(): ServiceDb {
  return wrapServiceDb(getTestPool());
}

/** Close the pool — call in test teardown to let the process exit cleanly. */
export async function closeTestPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
