/**
 * Integration tests for referral click + conversion + payout routes (Task 7):
 *   - click creates a row + 302 with tracking params appended + IP hashed (not raw),
 *   - conversion computes integer commission, creates a pending payout, writes
 *     audit + attribution; duplicate external_reference is idempotent,
 *   - ambassador split creates parent + split payout with no cent loss,
 *   - lead_form without consent is rejected (403),
 *   - payout status transitions are audited; paid is immutable (app + DB),
 *   - splits route produces ambassador + remainder with no cent loss,
 *   - admin guard on conversion + payout status.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET as click } from "@/app/api/referrals/click/route";
import { POST as conversion } from "@/app/api/referrals/conversion/route";
import { GET as payoutsList } from "@/app/api/payouts/route";
import { PATCH as payoutStatus } from "@/app/api/payouts/[id]/status/route";
import { POST as payoutSplit } from "@/app/api/payouts/[id]/splits/route";
import { recordConsent } from "@/lib/compliance/consent";
import {
  asAdmin,
  asUser,
  ctx,
  getRequest,
  jsonRequest,
  resetHarness,
  useTestDb,
} from "./api-harness";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const BASE = "http://localhost/api";

// Seed constants.
const BANKING_OFFER = "SEED-banking-01";
const AMB_CODE = "SEED-AMB-01";

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

/** Resolve a seeded offer id by tracking_code. */
async function offerId(trackingCode: string): Promise<string> {
  const rows = await query<{ id: string }>(
    "select id from partner_offers where tracking_code = $1",
    [trackingCode],
  );
  return rows[0].id;
}

describe.skipIf(!hasDb)("referral/conversion/payout routes", () => {
  beforeAll(() => useTestDb());

  it("click creates a row + 302 with tracking params; IP stored hashed not raw", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    const oid = await offerId(BANKING_OFFER);
    const rawIp = "203.0.113.77";
    const res = await click(
      getRequest(
        `${BASE}/referrals/click?offer=${oid}&ref=${AMB_CODE}&utm_source=fb&utm_campaign=spring&anon=anon-123`,
        { "x-forwarded-for": rawIp, "user-agent": "vitest-agent" },
      ),
    );
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    const locUrl = new URL(loc);
    // referral_id + tracking_code + utm appended.
    const referralId = locUrl.searchParams.get("referral_id");
    expect(referralId).toBeTruthy();
    expect(locUrl.searchParams.get("tracking_code")).toBe(BANKING_OFFER);
    expect(locUrl.searchParams.get("utm_source")).toBe("fb");
    expect(locUrl.searchParams.get("utm_campaign")).toBe("spring");

    // Row created with hashed IP (never the raw value).
    const rows = await query<{
      ip_hash: string | null;
      ambassador_id: string | null;
      anonymous_id: string | null;
      user_agent: string | null;
    }>(
      "select ip_hash, ambassador_id, anonymous_id, user_agent from referral_clicks where referral_id = $1",
      [referralId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].ip_hash).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(rows[0].ip_hash).not.toContain(rawIp);
    expect(rows[0].anonymous_id).toBe("anon-123");
    expect(rows[0].ambassador_id).toBe("33333333-3333-3333-3333-333333333301");
    expect(rows[0].user_agent).toBe("vitest-agent");
  });

  it("click credits the ambassador from the tulay_ref cookie when no ?ref= is present", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    // Deep-link flow: /r/<code> set the tulay_ref cookie earlier; the offer
    // click carries no ?ref= but must still credit the ambassador.
    const oid = await offerId(BANKING_OFFER);
    const res = await click(
      getRequest(`${BASE}/referrals/click?offer=${oid}`, {
        cookie: `tulay_ref=${AMB_CODE}`,
      }),
    );
    expect(res.status).toBe(302);
    const referralId = new URL(res.headers.get("location")!).searchParams.get(
      "referral_id",
    );
    const rows = await query<{ ambassador_id: string | null }>(
      "select ambassador_id from referral_clicks where referral_id = $1",
      [referralId],
    );
    expect(rows[0].ambassador_id).toBe("33333333-3333-3333-3333-333333333301");
  });

  it("conversion (no ambassador) computes integer commission + pending payout + audit + attribution", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    // Click without ambassador on the banking offer (fixed 5000¢ rule).
    const oid = await offerId(BANKING_OFFER);
    const clickRes = await click(
      getRequest(`${BASE}/referrals/click?offer=${oid}`, {
        "x-forwarded-for": "203.0.113.5",
      }),
    );
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;

    asAdmin();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 20000,
      }),
    );
    expect(convRes.status).toBe(201);
    const conv = await convRes.json();
    // Fixed rule → 5000¢ commission (integer).
    expect(conv.commission_amount_cents).toBe(5000);
    expect(Number.isInteger(conv.commission_amount_cents)).toBe(true);

    // A pending payout to the partner exists.
    const payouts = await query<{ status: string; payee_type: string; amount_cents: string }>(
      "select status, payee_type, amount_cents from payouts where id = $1",
      [conv.payout_id],
    );
    expect(payouts[0].status).toBe("pending");
    expect(payouts[0].payee_type).toBe("partner");
    expect(Number(payouts[0].amount_cents)).toBe(5000);

    // Audit + attribution written.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'referral_conversions' and entity_id = $1",
      [conv.conversion.id],
    );
    expect(audits.map((a) => a.action)).toContain("money.conversion_recorded");
    const attr = await query<{ event_type: string }>(
      "select event_type from revenue_attribution_events where conversion_id = $1",
      [conv.conversion.id],
    );
    expect(attr.map((a) => a.event_type)).toContain("conversion");
  });

  it("duplicate external_reference is idempotent", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    const oid = await offerId(BANKING_OFFER);
    const clickRes = await click(getRequest(`${BASE}/referrals/click?offer=${oid}`));
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;

    asAdmin();
    const ext = `EXT-${Date.now()}`;
    const first = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 10000,
        external_reference: ext,
      }),
    );
    expect(first.status).toBe(201);
    const firstConv = await first.json();

    const second = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 10000,
        external_reference: ext,
      }),
    );
    expect(second.status).toBe(200);
    const secondConv = await second.json();
    expect(secondConv.idempotent).toBe(true);
    expect(secondConv.conversion.id).toBe(firstConv.conversion.id);

    // Only one conversion row for this external id.
    const rows = await query(
      "select id from referral_conversions where external_conversion_id = $1",
      [ext],
    );
    expect(rows.length).toBe(1);
  });

  it("ambassador conversion creates parent + split payout with no cent loss", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    // Click WITH ambassador (20% split) on remittance offer (recurring 1500¢).
    const oid = await offerId("SEED-remittance-01");
    const clickRes = await click(
      getRequest(`${BASE}/referrals/click?offer=${oid}&ref=${AMB_CODE}`),
    );
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;

    asAdmin();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "transfer",
        conversion_value_cents: 30000,
      }),
    );
    const conv = await convRes.json();
    const commission = conv.commission_amount_cents as number; // recurring 1500¢
    expect(commission).toBe(1500);
    // Split present: 20% of 1500 = 300; remainder 1200; sum == commission.
    expect(conv.split.ambassadorCents).toBe(300);
    expect(conv.split.remainderCents).toBe(1200);
    expect(conv.split.ambassadorCents + conv.split.remainderCents).toBe(commission);

    // Parent payout is the PARTNER/house side and holds the REMAINDER (1200),
    // NOT the full commission — so parent + child == commission with no
    // double-count. The child ambassador payout links to the parent.
    const parent = await query<{ payee_type: string; amount_cents: string }>(
      "select payee_type, amount_cents from payouts where id = $1",
      [conv.payout_id],
    );
    expect(parent[0].payee_type).toBe("partner");
    expect(Number(parent[0].amount_cents)).toBe(1200);

    const splitRows = await query<{ parent_payout_id: string; amount_cents: string }>(
      "select parent_payout_id, amount_cents from payouts where id = $1",
      [conv.split.payoutId],
    );
    expect(splitRows[0].parent_payout_id).toBe(conv.payout_id);
    expect(Number(splitRows[0].amount_cents)).toBe(300);

    // Regression: the SUM of all payout rows for this conversion equals the
    // commission (1500) — the split does not inflate liability.
    const payoutSum = await query<{ total: string }>(
      "select coalesce(sum(amount_cents),0)::text as total from payouts where conversion_id = $1",
      [conv.conversion.id],
    );
    expect(Number(payoutSum[0].total)).toBe(1500);

    // ambassador_referrals row written for the ambassador's cut only.
    const ar = await query<{ attributed_amount_cents: string }>(
      "select attributed_amount_cents from ambassador_referrals where conversion_id = $1",
      [conv.conversion.id],
    );
    expect(ar.length).toBeGreaterThanOrEqual(1);
    expect(Number(ar[0].attributed_amount_cents)).toBe(300);
  });

  it("lead_form conversion without consent is rejected (403); with consent succeeds", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    // tenant_insurance offer is offer_type lead_form.
    const oid = await offerId("SEED-tenant_insurance-01");
    const clickRes = await click(getRequest(`${BASE}/referrals/click?offer=${oid}`));
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;

    asAdmin();
    const email = `lead-${Date.now()}@example.com`;
    const noConsent = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "lead_form",
        conversion_value_cents: 5000,
        subject_email: email,
      }),
    );
    expect(noConsent.status).toBe(403);

    // Grant consent, then it succeeds.
    await recordConsent(
      { subjectEmail: email, purpose: "lead_referral", consentTextVersion: "1.0.0" },
      getTestServiceDb(),
    );
    const withConsent = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "lead_form",
        conversion_value_cents: 5000,
        subject_email: email,
      }),
    );
    expect(withConsent.status).toBe(201);
  });

  it("payout status transitions are audited; paid is immutable (app + DB)", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    const oid = await offerId(BANKING_OFFER);
    const clickRes = await click(getRequest(`${BASE}/referrals/click?offer=${oid}`));
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;
    asAdmin();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 10000,
      }),
    );
    const payoutId = (await convRes.json()).payout_id as string;

    // pending → approved → paid.
    const approve = await payoutStatus(
      jsonRequest(`${BASE}/payouts/${payoutId}/status`, "PATCH", { status: "approved" }),
      ctx(payoutId),
    );
    expect(approve.status).toBe(200);
    const paid = await payoutStatus(
      jsonRequest(`${BASE}/payouts/${payoutId}/status`, "PATCH", { status: "paid" }),
      ctx(payoutId),
    );
    expect(paid.status).toBe(200);

    // Transitions audited.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'payouts' and entity_id = $1",
      [payoutId],
    );
    expect(audits.filter((a) => a.action === "money.payout_status_changed").length).toBe(2);

    // App-layer block: changing a paid payout → 409.
    const blocked = await payoutStatus(
      jsonRequest(`${BASE}/payouts/${payoutId}/status`, "PATCH", { status: "rejected" }),
      ctx(payoutId),
    );
    expect(blocked.status).toBe(409);

    // DB-layer block: a direct UPDATE also raises.
    let dbError: unknown;
    try {
      await query("update payouts set notes = 'x' where id = $1", [payoutId]);
    } catch (e) {
      dbError = e;
    }
    expect(dbError).toBeTruthy();
  });

  it("illegal transition pending → paid is rejected (409)", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    const oid = await offerId(BANKING_OFFER);
    const clickRes = await click(getRequest(`${BASE}/referrals/click?offer=${oid}`));
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;
    asAdmin();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 10000,
      }),
    );
    const payoutId = (await convRes.json()).payout_id as string;
    const res = await payoutStatus(
      jsonRequest(`${BASE}/payouts/${payoutId}/status`, "PATCH", { status: "paid" }),
      ctx(payoutId),
    );
    expect(res.status).toBe(409);
  });

  it("payouts list requires admin + returns liability summary", async () => {
    useTestDb();
    asUser();
    const forbidden = await payoutsList(getRequest(`${BASE}/payouts`));
    expect(forbidden.status).toBe(403);

    asAdmin();
    const res = await payoutsList(getRequest(`${BASE}/payouts`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.payouts)).toBe(true);
    expect(data.summary).toHaveProperty("outstanding_liability_cents");
    expect(Number.isInteger(data.summary.outstanding_liability_cents)).toBe(true);
  });

  it("splits route: creates ambassador split from a parent payout, no cent loss", async () => {
    useTestDb();
    resetHarness();
    useTestDb();
    // A partner-payee parent payout (no ambassador on the click), then split
    // explicitly to the seeded ambassador at 20%.
    const oid = await offerId(BANKING_OFFER);
    const clickRes = await click(getRequest(`${BASE}/referrals/click?offer=${oid}`));
    const referralId = new URL(clickRes.headers.get("location")!).searchParams.get(
      "referral_id",
    )!;
    asAdmin();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: referralId,
        conversion_type: "signup",
        conversion_value_cents: 10000,
      }),
    );
    const payoutId = (await convRes.json()).payout_id as string;

    const splitRes = await payoutSplit(
      jsonRequest(`${BASE}/payouts/${payoutId}/splits`, "POST", {
        ambassador_id: "33333333-3333-3333-3333-333333333301",
        split_bps: 2000,
      }),
      ctx(payoutId),
    );
    expect(splitRes.status).toBe(201);
    const split = await splitRes.json();
    // 20% of 5000 = 1000; remainder 4000; sum == parent amount.
    expect(split.ambassador_cents).toBe(1000);
    expect(split.remainder_cents).toBe(4000);
    expect(split.ambassador_cents + split.remainder_cents).toBe(5000);
    expect(split.split_payout.parent_payout_id).toBe(payoutId);

    // Parent payout is REDUCED to the remainder (4000), not left at 5000 —
    // otherwise the split would inflate liability by the ambassador's cut.
    const parentAfter = await query<{ amount_cents: string }>(
      "select amount_cents from payouts where id = $1",
      [payoutId],
    );
    expect(Number(parentAfter[0].amount_cents)).toBe(4000);

    // Regression: sum of all payout rows for the conversion == commission 5000.
    const convId = split.split_payout.conversion_id as string;
    const sum = await query<{ total: string }>(
      "select coalesce(sum(amount_cents),0)::text as total from payouts where conversion_id = $1",
      [convId],
    );
    expect(Number(sum[0].total)).toBe(5000);

    // Idempotency: splitting the same parent again returns the existing child
    // (200), does NOT stack a second child, and does NOT reduce the parent again.
    const splitAgain = await payoutSplit(
      jsonRequest(`${BASE}/payouts/${payoutId}/splits`, "POST", {
        ambassador_id: "33333333-3333-3333-3333-333333333301",
        split_bps: 2000,
      }),
      ctx(payoutId),
    );
    expect(splitAgain.status).toBe(200);
    const again = await splitAgain.json();
    expect(again.idempotent).toBe(true);
    const children = await query<{ id: string }>(
      "select id from payouts where parent_payout_id = $1",
      [payoutId],
    );
    expect(children.length).toBe(1);
    const sumAfter = await query<{ total: string }>(
      "select coalesce(sum(amount_cents),0)::text as total from payouts where conversion_id = $1",
      [convId],
    );
    expect(Number(sumAfter[0].total)).toBe(5000);

    // Audit written for the split.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'payouts' and entity_id = $1",
      [split.split_payout.id],
    );
    expect(audits.map((a) => a.action)).toContain("money.payout_split_created");
  });

  it("conversion + payout status require admin (403 for user)", async () => {
    useTestDb();
    asUser();
    const convRes = await conversion(
      jsonRequest(`${BASE}/referrals/conversion`, "POST", {
        referral_id: "whatever",
        conversion_type: "signup",
        conversion_value_cents: 100,
      }),
    );
    expect(convRes.status).toBe(403);

    const statusRes = await payoutStatus(
      jsonRequest(`${BASE}/payouts/x/status`, "PATCH", { status: "approved" }),
      ctx("00000000-0000-0000-0000-000000000000"),
    );
    expect(statusRes.status).toBe(403);
  });
});
