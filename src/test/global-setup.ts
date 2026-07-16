/**
 * Vitest global setup for integration suites.
 *
 * Applies migrations + seed to the test database once before any suite runs,
 * reusing the raw-SQL logic in `scripts/db.mjs`. The target database is
 * `TEST_DATABASE_URL` (falling back to `DATABASE_URL`). If the database does not
 * exist yet it is created automatically (connecting to the maintenance
 * `postgres` database first).
 *
 * If no database URL is configured this setup is a no-op, so pure unit tests
 * still run without a Postgres available.
 */
import pg from "pg";
// scripts/db.mjs is plain ESM JS (resolved via allowJs); reuse its helpers.
import { migrate, seed } from "../../scripts/db.mjs";

function resolveUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
}

/** Ensure the target database exists, creating it if necessary. */
async function ensureDatabase(url: string): Promise<void> {
  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!dbName) return;

  // Connect to the maintenance database to check/create the target.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rows } = await admin.query(
      "select 1 from pg_database where datname = $1",
      [dbName],
    );
    if (rows.length === 0) {
      // Database identifiers can't be parameterized; dbName comes from our own
      // env-configured URL, and we quote it to be safe.
      await admin.query(`create database "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const url = resolveUrl();
  if (!url) {
    // No database configured — skip bootstrap (unit-only run).
    return;
  }

  await ensureDatabase(url);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Fresh schema so migrations apply against a clean DB every run.
    await client.query("drop schema if exists public cascade;");
    await client.query("create schema public;");
    await client.query("grant all on schema public to public;");
    await migrate(client);
    await seed(client);
  } finally {
    await client.end();
  }
}
