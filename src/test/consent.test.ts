/**
 * DB-backed tests for the consent ledger. requireConsent must block (403)
 * without a grant; withdrawal must append a new row (never mutate).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  ConsentRequiredError,
  getEffectiveConsent,
  recordConsent,
  requireConsent,
  withdrawConsent,
} from "@/lib/compliance/consent";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("consent", () => {
  const db = () => getTestServiceDb();

  it("requireConsent throws 403 when there is no consent", async () => {
    const email = `no-consent-${Date.now()}@example.com`;
    let caught: unknown;
    try {
      await requireConsent("lead_referral", { subjectEmail: email }, db());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConsentRequiredError);
    expect((caught as ConsentRequiredError).status).toBe(403);
  });

  it("records a grant and requireConsent then passes", async () => {
    const email = `granted-${Date.now()}@example.com`;
    await recordConsent(
      {
        subjectEmail: email,
        purpose: "lead_referral",
        dataCategories: ["name", "email"],
        sharedWith: "partner:sample",
        consentTextVersion: "1.0.0",
        ip: "203.0.113.9",
      },
      db(),
    );
    const effective = await requireConsent(
      "lead_referral",
      { subjectEmail: email },
      db(),
    );
    expect(effective.granted).toBe(true);
    // IP is stored hashed, never raw.
    expect(effective.ip_hash).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(effective.subject_email_hash).toMatch(/^v1:/);
  });

  it("withdrawal appends a new row (does not mutate) and flips effective consent", async () => {
    const email = `withdraw-${Date.now()}@example.com`;
    const grant = await recordConsent(
      {
        subjectEmail: email,
        purpose: "marketing",
        consentTextVersion: "1.0.0",
      },
      db(),
    );

    await withdrawConsent(
      { subjectEmail: email, purpose: "marketing", consentTextVersion: "1.0.0" },
      db(),
    );

    // Two rows now exist for this subject+purpose; the original is intact.
    const rows = await query<{ id: string; granted: boolean }>(
      "select id, granted from consent_records where subject_email_hash = (select subject_email_hash from consent_records where id = $1) order by created_at asc",
      [grant.id],
    );
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(grant.id);
    expect(rows[0].granted).toBe(true); // original untouched

    // Effective consent is now the withdrawal.
    const effective = await getEffectiveConsent(
      { subjectEmail: email },
      "marketing",
      db(),
    );
    expect(effective?.granted).toBe(false);
    await expect(
      requireConsent("marketing", { subjectEmail: email }, db()),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("writes an audit row for each consent event", async () => {
    const email = `audited-${Date.now()}@example.com`;
    const rec = await recordConsent(
      { subjectEmail: email, purpose: "concierge", consentTextVersion: "1.0.0" },
      db(),
    );
    const audit = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'consent_records' and entity_id = $1",
      [rec.id],
    );
    expect(audit.map((a) => a.action)).toContain("consent.granted");
  });
});
