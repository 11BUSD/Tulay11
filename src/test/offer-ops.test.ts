/**
 * Offer Ops agent:
 *   - a term backed by a stored agreement/DD source -> a `pending` offer (never live),
 *   - an unsourced term -> blocked with a high-severity risk flag + no offer,
 *   - money stays integer cents.
 */
import { afterAll, describe, expect, it } from "vitest";
import { offerOpsAgent } from "@/lib/agents/impl/offer-ops";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

async function newPartner(): Promise<string> {
  const [p] = await query<{ id: string }>(
    `insert into partners (name, status) values ($1,'in_review') returning id`,
    [`[TEST] OfferOps ${Date.now()}-${Math.random()}`],
  );
  return p.id;
}
async function newAgreement(partnerId: string, terms: string): Promise<string> {
  const [a] = await query<{ id: string }>(
    `insert into partner_agreements (partner_id, status, terms_summary)
     values ($1,'signed',$2) returning id`,
    [partnerId, terms],
  );
  return a.id;
}

describe.skipIf(!hasDb)("offer-ops agent", () => {
  it("creates a pending (not-live) offer when terms trace to a stored agreement", async () => {
    const partnerId = await newPartner();
    // Agreement references the terms the offer asserts.
    const agreementId = await newAgreement(
      partnerId,
      "commission_type fixed; commission_value_cents 1500; referral program.",
    );
    const runId = await createRunRow("offer-ops");
    const ctx = testAgentContext(runId);

    const result = await offerOpsAgent.run(ctx, {
      partnerId,
      agreementId,
      offer: {
        title: "[TEST] Referral offer",
        settlement_pillar: "banking",
        offer_type: "referral",
        commission_type: "fixed",
        commission_value_cents: 1500,
        user_reward_value_cents: 500,
      },
    });

    expect(result.outputJson.blocked).toBe(false);
    expect(result.outputJson.offerId).toBeTruthy();
    expect(result.outputJson.status).toBe("pending");

    const [offer] = await query<{
      status: string;
      active: boolean;
      commission_value_cents: string;
    }>(
      "select status, active, commission_value_cents from partner_offers where id = $1",
      [result.outputJson.offerId],
    );
    expect(offer.status).toBe("pending");
    expect(offer.active).toBe(false);
    // Integer cents preserved.
    expect(Number.isInteger(Number(offer.commission_value_cents))).toBe(true);
    expect(offer.commission_value_cents).toBe("1500");

    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("agent.offer_ops");
  });

  it("blocks an unsourced term (no offer, high-severity risk flag)", async () => {
    const partnerId = await newPartner();
    // Agreement mentions nothing about the asserted terms.
    const agreementId = await newAgreement(partnerId, "General MOU, no commercial terms.");
    const runId = await createRunRow("offer-ops");
    const ctx = testAgentContext(runId);

    const result = await offerOpsAgent.run(ctx, {
      partnerId,
      agreementId,
      offer: {
        title: "[TEST] Unsourced offer",
        settlement_pillar: "banking",
        offer_type: "coupon",
        commission_type: "percentage",
        commission_value_cents: 999,
        user_reward_value_cents: 0,
      },
    });

    expect(result.outputJson.blocked).toBe(true);
    expect(result.outputJson.offerId).toBeNull();
    expect(result.status).toBe("needs_review");
    expect(result.riskFlags.some((f) => f.severity === "high")).toBe(true);

    // No offer created.
    const [count] = await query<{ count: string }>(
      "select count(*)::text as count from partner_offers where partner_id = $1",
      [partnerId],
    );
    expect(count.count).toBe("0");

    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("agent.offer_ops_blocked");
  });
});
