/**
 * Schema foundation integration test.
 *
 * Runs against the test database bootstrapped by src/test/global-setup.ts
 * (migrations + seed applied to TEST_DATABASE_URL || DATABASE_URL). Asserts the
 * intended schema guarantees — the guards are NOT weakened to make the tests
 * pass; the tests assert the guarantees.
 */
import { afterAll, describe, expect, it } from "vitest";
import { closeTestPool, query } from "./db";

// Integration suite: requires a Postgres via TEST_DATABASE_URL || DATABASE_URL.
// When neither is set (pure unit run), skip so `npm test` stays green offline.
const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("schema foundation", () => {
  it("applies migrations on a fresh DB (core tables exist)", async () => {
    const rows = await query<{ table_name: string }>(
      `select table_name from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const names = rows.map((r) => r.table_name);
    for (const t of [
      "settlement_pillars",
      "partners",
      "partner_offers",
      "payouts",
      "audit_logs",
      "consent_records",
      "agent_runs",
      "agent_tasks",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("loads seed data (10 pillars, >=4 sample partners, offers have tracking codes)", async () => {
    const [{ count: pillars }] = await query<{ count: string }>(
      "select count(*)::text as count from settlement_pillars",
    );
    expect(Number(pillars)).toBe(10);

    const [{ count: partners }] = await query<{ count: string }>(
      "select count(*)::text as count from partners where name like '[SAMPLE]%'",
    );
    expect(Number(partners)).toBeGreaterThanOrEqual(4);

    const offers = await query<{ tracking_code: string | null }>(
      "select tracking_code from partner_offers",
    );
    expect(offers.length).toBeGreaterThanOrEqual(4);
    for (const o of offers) {
      expect(o.tracking_code).toBeTruthy();
    }
  });

  it("blocks UPDATE of a paid payout (immutability trigger)", async () => {
    const [row] = await query<{ id: string }>(
      `insert into payouts (payee_type, amount_cents, status, paid_at)
         values ('partner', 1000, 'paid', now()) returning id`,
    );
    await expect(
      query("update payouts set notes = 'changed' where id = $1", [row.id]),
    ).rejects.toThrow(/immutable/i);
  });

  it("blocks DELETE of a paid payout (immutability trigger)", async () => {
    const [row] = await query<{ id: string }>(
      `insert into payouts (payee_type, amount_cents, status, paid_at)
         values ('partner', 2000, 'paid', now()) returning id`,
    );
    await expect(
      query("delete from payouts where id = $1", [row.id]),
    ).rejects.toThrow(/cannot be deleted/i);
  });

  it("auto-bumps updated_at on partner update", async () => {
    const [row] = await query<{ id: string; updated_at: string }>(
      `insert into partners (name) values ('[SAMPLE] updated_at probe')
         returning id, updated_at`,
    );
    // Ensure a measurable clock tick before the update.
    await new Promise((r) => setTimeout(r, 10));
    const [after] = await query<{ updated_at: string }>(
      "update partners set notes = 'touched' where id = $1 returning updated_at",
      [row.id],
    );
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(row.updated_at).getTime(),
    );
  });

  it("rejects UPDATE on an append-only table (audit_logs)", async () => {
    const [row] = await query<{ id: string }>(
      `insert into audit_logs (actor_type, action, entity_type, entity_id)
         values ('system', 'test.action', 'test', 'e1') returning id`,
    );
    await expect(
      query("update audit_logs set action = 'mutated' where id = $1", [row.id]),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects DELETE on an append-only table (audit_logs)", async () => {
    const [row] = await query<{ id: string }>(
      `insert into audit_logs (actor_type, action, entity_type, entity_id)
         values ('system', 'test.action2', 'test', 'e2') returning id`,
    );
    await expect(
      query("delete from audit_logs where id = $1", [row.id]),
    ).rejects.toThrow(/append-only/i);
  });
});
