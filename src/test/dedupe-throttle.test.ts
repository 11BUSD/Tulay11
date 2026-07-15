/**
 * Dedupe / throttle / suppression:
 *   - dedupe hash is deterministic; a duplicate is detected (DB unique index),
 *   - throttle enforces per-contact cap + min-gap + per-campaign daily cap,
 *   - suppression excludes opted_out / bounced / unsubscribed contacts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeDedupeHash, isDuplicate } from "@/lib/outreach/dedupe";
import { checkThrottle } from "@/lib/outreach/throttle";
import { isContactSuppressed } from "@/lib/outreach/suppression";
import { clearServiceDb, setServiceDb } from "@/lib/db/client";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

beforeAll(() => {
  if (hasDb) setServiceDb(getTestServiceDb());
});

afterAll(async () => {
  if (hasDb) {
    clearServiceDb();
    await closeTestPool();
  }
});

describe("dedupe hash (pure)", () => {
  it("is deterministic + case/space-insensitive on email", () => {
    const a = computeDedupeHash("A@Example.com ", "c1", 0);
    const b = computeDedupeHash("a@example.com", "c1", 0);
    expect(a).toBe(b);
    expect(a).not.toBe(computeDedupeHash("a@example.com", "c1", 1));
  });
});

describe.skipIf(!hasDb)("dedupe / throttle / suppression (DB)", () => {
  async function newCampaign(): Promise<string> {
    const [c] = await query<{ id: string }>(
      `insert into outreach_campaigns (name) values ('[TEST] Throttle') returning id`,
    );
    return c.id;
  }
  async function newContact(consent = "opted_in"): Promise<{ id: string; email: string }> {
    const email = `dt-${Date.now()}-${Math.random()}@example.com`;
    const [c] = await query<{ id: string }>(
      `insert into outreach_contacts (name, email, consent_status) values ('[TEST]',$1,$2) returning id`,
      [email, consent],
    );
    return { id: c.id, email };
  }

  it("detects a duplicate dedupe hash via the DB", async () => {
    const campaign = await newCampaign();
    const contact = await newContact();
    const hash = computeDedupeHash(contact.email, campaign, 0);
    expect(await isDuplicate(hash)).toBe(false);
    await query(
      `insert into outreach_messages (campaign_id, contact_id, direction, state, dedupe_hash) values ($1,$2,'outbound','drafted',$3)`,
      [campaign, contact.id, hash],
    );
    expect(await isDuplicate(hash)).toBe(true);
  });

  it("throttle: per-contact cap blocks after N counted messages", async () => {
    const campaign = await newCampaign();
    const contact = await newContact();
    // 4 sent messages hits the default cap of 4.
    for (let i = 0; i < 4; i++) {
      await query(
        `insert into outreach_messages (campaign_id, contact_id, direction, state, sent_at) values ($1,$2,'outbound','sent', now() - interval '10 days')`,
        [campaign, contact.id],
      );
    }
    const decision = await checkThrottle(contact.id, campaign, {
      now: new Date(),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("contact_cap");
  });

  it("throttle: min-gap blocks a too-soon follow-up", async () => {
    const campaign = await newCampaign();
    const contact = await newContact();
    await query(
      `insert into outreach_messages (campaign_id, contact_id, direction, state, sent_at) values ($1,$2,'outbound','sent', now())`,
      [campaign, contact.id],
    );
    const decision = await checkThrottle(contact.id, campaign, {
      now: new Date(),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("min_gap");
  });

  it("throttle: allows when under caps + past the gap", async () => {
    const campaign = await newCampaign();
    const contact = await newContact();
    const decision = await checkThrottle(contact.id, campaign, {
      now: new Date(),
    });
    expect(decision.allowed).toBe(true);
  });

  it("suppression: opted_out + bounced are suppressed", async () => {
    const opted = await newContact("opted_out");
    const bounced = await newContact("bounced");
    const ok = await newContact("opted_in");
    expect((await isContactSuppressed(opted.id)).suppressed).toBe(true);
    expect((await isContactSuppressed(bounced.id)).suppressed).toBe(true);
    expect((await isContactSuppressed(ok.id)).suppressed).toBe(false);
  });

  it("suppression: honours the unsubscribe ledger by email", async () => {
    const c = await newContact("opted_in");
    const db = getTestServiceDb();
    const { recordUnsubscribe } = await import("@/lib/compliance/casl");
    await recordUnsubscribe({ email: c.email, channel: "all" }, db);
    expect((await isContactSuppressed(c.id)).suppressed).toBe(true);
  });
});
