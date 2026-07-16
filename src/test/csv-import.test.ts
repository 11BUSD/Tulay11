/**
 * CSV import: parses quoted fields, upserts outreach_contacts, dedupes by email.
 */
import { afterAll, describe, expect, it } from "vitest";
import { parseCsv, importContacts } from "@/lib/outreach/csv-import";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe("parseCsv (pure)", () => {
  it("parses headers + quoted fields with embedded commas", () => {
    const rows = parseCsv(
      'name,email,role\n"Doe, Jane",jane@example.com,"VP, Sales"\nJohn,john@example.com,Owner\n',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Doe, Jane",
      email: "jane@example.com",
      role: "VP, Sales",
    });
    expect(rows[1].email).toBe("john@example.com");
  });

  it("handles escaped quotes + trailing row without newline", () => {
    const rows = parseCsv('email,note\na@x.com,"say ""hi"""');
    expect(rows[0].note).toBe('say "hi"');
  });
});

describe.skipIf(!hasDb)("importContacts (DB)", () => {
  it("creates contacts + dedupes by email", async () => {
    const uniq = Date.now();
    const csv =
      `name,email,role\n` +
      `Alpha,alpha-${uniq}@example.com,CEO\n` +
      `Beta,beta-${uniq}@example.com,CFO\n` +
      `Dup,alpha-${uniq}@example.com,Dup\n` + // same email → skipped
      `NoEmail,,X\n`; // missing email → skipped

    const db = getTestServiceDb();
    const result = await importContacts(csv, { db });
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(2);

    const rows = await query<{ email: string }>(
      "select email from outreach_contacts where email like $1",
      [`%-${uniq}@example.com`],
    );
    expect(rows).toHaveLength(2);

    // Re-import is fully deduped (all skipped).
    const again = await importContacts(csv, { db });
    expect(again.created).toBe(0);
  });
});
