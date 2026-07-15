#!/usr/bin/env node
/**
 * Lightweight raw-SQL DB helper — no Supabase CLI required.
 *
 *   node scripts/db.mjs migrate  # apply supabase/migrations/*.sql in sorted order
 *   node scripts/db.mjs seed     # apply supabase/seed/*.sql in sorted order
 *   node scripts/db.mjs reset    # drop + recreate public schema, then migrate + seed
 *
 * Uses the DATABASE_URL env var and the `pg` package.
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const SEED_DIR = path.join(ROOT, "supabase", "seed");

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env and set it.",
    );
    process.exit(1);
  }
  return url;
}

async function sqlFilesIn(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((f) => path.join(dir, f));
}

async function applyFiles(client, files) {
  if (files.length === 0) {
    console.log("  (no .sql files found — nothing to apply)");
    return;
  }
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    process.stdout.write(`  applying ${path.basename(file)} ... `);
    await client.query(sql);
    console.log("ok");
  }
}

async function migrate(client) {
  console.log("Applying migrations:");
  await applyFiles(client, await sqlFilesIn(MIGRATIONS_DIR));
}

async function seed(client) {
  console.log("Applying seed:");
  await applyFiles(client, await sqlFilesIn(SEED_DIR));
}

async function reset(client) {
  console.log("Resetting public schema:");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE;");
  await client.query("CREATE SCHEMA public;");
  await client.query("GRANT ALL ON SCHEMA public TO public;");
  console.log("  schema recreated");
  await migrate(client);
  await seed(client);
}

async function main() {
  const command = process.argv[2];
  if (!["migrate", "seed", "reset"].includes(command)) {
    console.error("Usage: node scripts/db.mjs <migrate|seed|reset>");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    if (command === "migrate") await migrate(client);
    else if (command === "seed") await seed(client);
    else await reset(client);
    console.log("Done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
