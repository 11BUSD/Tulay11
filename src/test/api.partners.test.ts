/**
 * Integration tests for the Partner/Offer OS routes (Task 6):
 *   - admin guard rejects non-admin on partner/offer CRUD + attribution,
 *   - partner + offer CRUD round-trip,
 *   - license verification stamps license_verified_at + writes a
 *     license_verifications row,
 *   - recommendations: active-only, ranked, Filipino/Tagalog prioritized,
 *     paused/inactive hidden, regulated offer hidden if partner unverified,
 *     fallback offers when no city match, public (no admin),
 *   - audit_logs row written per partner/offer mutation + attribution.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  GET as partnersList,
  POST as partnersCreate,
} from "@/app/api/partners/route";
import {
  DELETE as partnerDelete,
  GET as partnerGet,
  PATCH as partnerPatch,
} from "@/app/api/partners/[id]/route";
import { POST as offersCreate } from "@/app/api/offers/route";
import {
  DELETE as offerDelete,
  PATCH as offerPatch,
} from "@/app/api/offers/[id]/route";
import { GET as recommendations } from "@/app/api/recommendations/route";
import { POST as attribution } from "@/app/api/attribution/route";
import {
  asAdmin,
  asUser,
  ctx,
  getRequest,
  jsonRequest,
  resetHarness,
  useTestDb,
} from "./api-harness";
import { closeTestPool, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

const BASE = "http://localhost/api";

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("partner/offer OS routes", () => {
  beforeAll(() => useTestDb());

  it("rejects non-admin (401 anon, 403 user) on partner CRUD", async () => {
    // No actor → 401.
    resetHarness();
    useTestDb();
    let res = await partnersList(getRequest(`${BASE}/partners`));
    expect(res.status).toBe(401);

    asUser();
    res = await partnersList(getRequest(`${BASE}/partners`));
    expect(res.status).toBe(403);

    res = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", { name: "X" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects non-admin on offer create + attribution", async () => {
    useTestDb();
    asUser();
    const offerRes = await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: "11111111-1111-1111-1111-111111111101",
        title: "Y",
        settlement_pillar: "banking",
      }),
    );
    expect(offerRes.status).toBe(403);

    const attrRes = await attribution(
      jsonRequest(`${BASE}/attribution`, "POST", {
        event_type: "manual",
        amount_cents: 100,
      }),
    );
    expect(attrRes.status).toBe(403);
  });

  it("partner + offer CRUD round-trip with audit per mutation", async () => {
    useTestDb();
    asAdmin();

    // Create partner.
    const createRes = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", {
        name: "[TEST] CRUD Partner",
        category: "banking",
        languages_supported: ["en", "tl"],
        filipino_focus: true,
      }),
    );
    expect(createRes.status).toBe(201);
    const { partner } = await createRes.json();
    expect(partner.name).toBe("[TEST] CRUD Partner");
    const partnerId = partner.id as string;

    // GET it.
    const getRes = await partnerGet(getRequest(`${BASE}/partners/${partnerId}`), ctx(partnerId));
    expect(getRes.status).toBe(200);

    // PATCH activate/pause (status).
    const patchRes = await partnerPatch(
      jsonRequest(`${BASE}/partners/${partnerId}`, "PATCH", { status: "active" }),
      ctx(partnerId),
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).partner.status).toBe("active");

    // Create an offer for this partner.
    const offerRes = await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: partnerId,
        title: "[TEST] Offer",
        settlement_pillar: "banking",
        commission_type: "fixed",
        commission_value_cents: 5000,
        tracking_code: `TEST-CRUD-${Date.now()}`,
        city_targets: ["Toronto"],
        language_targets: ["en"],
      }),
    );
    expect(offerRes.status).toBe(201);
    const offerId = (await offerRes.json()).offer.id as string;

    // Offer create with unknown pillar → 400.
    const badOffer = await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: partnerId,
        title: "[TEST] Bad",
        settlement_pillar: "not_a_pillar",
      }),
    );
    expect(badOffer.status).toBe(400);

    // PATCH offer.
    const offerPatchRes = await offerPatch(
      jsonRequest(`${BASE}/offers/${offerId}`, "PATCH", { priority_score: 42 }),
      ctx(offerId),
    );
    expect(offerPatchRes.status).toBe(200);
    expect((await offerPatchRes.json()).offer.priority_score).toBe(42);

    // Audit rows written for each mutation.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_id = $1 or entity_id = $2",
      [partnerId, offerId],
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("partner.created");
    expect(actions).toContain("partner.updated");
    expect(actions).toContain("offer.created");
    expect(actions).toContain("offer.updated");

    // DELETE both.
    const delOffer = await offerDelete(getRequest(`${BASE}/offers/${offerId}`), ctx(offerId));
    expect(delOffer.status).toBe(200);
    const delPartner = await partnerDelete(getRequest(`${BASE}/partners/${partnerId}`), ctx(partnerId));
    expect(delPartner.status).toBe(200);
  });

  it("license verification stamps license_verified_at + writes license_verifications", async () => {
    useTestDb();
    asAdmin();
    const createRes = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", {
        name: "[TEST] Regulated Partner",
        licensed_required: true,
      }),
    );
    const partnerId = (await createRes.json()).partner.id as string;

    const patchRes = await partnerPatch(
      jsonRequest(`${BASE}/partners/${partnerId}`, "PATCH", {
        license_verification: {
          license_type: "insurance_broker",
          license_number: "FSRA-TEST-1",
          regulator: "FSRA",
          method: "manual_registry_check",
          result: "verified",
        },
      }),
      ctx(partnerId),
    );
    expect(patchRes.status).toBe(200);
    const { partner } = await patchRes.json();
    expect(partner.license_verified_at).not.toBeNull();

    const lvs = await query<{ result: string }>(
      "select result from license_verifications where partner_id = $1",
      [partnerId],
    );
    expect(lvs.map((l) => l.result)).toContain("verified");

    // A failed re-check clears license_verified_at.
    const failRes = await partnerPatch(
      jsonRequest(`${BASE}/partners/${partnerId}`, "PATCH", {
        license_verification: { result: "failed" },
      }),
      ctx(partnerId),
    );
    expect((await failRes.json()).partner.license_verified_at).toBeNull();
  });

  it("recommendations is public (no admin) + active-only, ranked", async () => {
    useTestDb();
    // No actor set → still works (public read).
    resetHarness();
    useTestDb();
    const res = await recommendations(
      getRequest(`${BASE}/recommendations?pillar=banking&city=Toronto&lang=tl`),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pillar).toBe("banking");
    expect(Array.isArray(data.recommendations)).toBe(true);
    // Seed banking offer is active + live → present, with partner disclosure.
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.recommendations[0].partner.name).toContain("[SAMPLE]");
    // Filipino/Tagalog partner is prioritized (first) for lang=tl.
    expect(data.recommendations[0].partner_id).toBe(
      "11111111-1111-1111-1111-111111111101",
    );
  });

  it("recommendations hides paused/inactive offers", async () => {
    useTestDb();
    asAdmin();
    // Create a partner + an inactive offer under 'housing'.
    const p = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", {
        name: "[TEST] Housing P",
        status: "active",
      }),
    );
    const pid = (await p.json()).partner.id as string;
    await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: pid,
        title: "[TEST] Inactive housing",
        settlement_pillar: "housing",
        active: false,
        tracking_code: `TEST-INACT-${Date.now()}`,
      }),
    );

    resetHarness();
    useTestDb();
    const res = await recommendations(getRequest(`${BASE}/recommendations?pillar=housing`));
    const data = await res.json();
    const titles = data.recommendations.map((r: { title: string }) => r.title);
    expect(titles).not.toContain("[TEST] Inactive housing");
  });

  it("recommendations hides a regulated offer whose partner is unverified", async () => {
    useTestDb();
    asAdmin();
    // Unverified regulated partner (tenant_insurance → 'insurance' disclaimer).
    const p = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", {
        name: "[TEST] Unverified Insurer",
        licensed_required: true,
        status: "active",
      }),
    );
    const pid = (await p.json()).partner.id as string;
    const trackingCode = `TEST-UNVER-${Date.now()}`;
    await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: pid,
        title: "[TEST] Unverified insurance offer",
        settlement_pillar: "tenant_insurance",
        offer_type: "lead_form",
        tracking_code: trackingCode,
      }),
    );

    resetHarness();
    useTestDb();
    const res = await recommendations(
      getRequest(`${BASE}/recommendations?pillar=tenant_insurance`),
    );
    const data = await res.json();
    expect(data.disclaimer.requires_licensed_referral).toBe(true);
    const titles = data.recommendations.map((r: { title: string }) => r.title);
    expect(titles).not.toContain("[TEST] Unverified insurance offer");
    // But the seeded verified insurer IS present.
    expect(titles).toContain("[SAMPLE] Tenant insurance quote");
  });

  it("recommendations returns fallback (general) offers when no city matches", async () => {
    useTestDb();
    asAdmin();
    // A general offer (no city_targets) under 'community_life'.
    const p = await partnersCreate(
      jsonRequest(`${BASE}/partners`, "POST", {
        name: "[TEST] Community P",
        status: "active",
      }),
    );
    const pid = (await p.json()).partner.id as string;
    await offersCreate(
      jsonRequest(`${BASE}/offers`, "POST", {
        partner_id: pid,
        title: "[TEST] General community offer",
        settlement_pillar: "community_life",
        city_targets: [],
        tracking_code: `TEST-GEN-${Date.now()}`,
        priority_score: 10,
      }),
    );

    resetHarness();
    useTestDb();
    // Request an unmatched city → fallback surfaces the general offer.
    const res = await recommendations(
      getRequest(`${BASE}/recommendations?pillar=community_life&city=Nowhereville`),
    );
    const data = await res.json();
    const titles = data.recommendations.map((r: { title: string }) => r.title);
    expect(titles).toContain("[TEST] General community offer");
  });

  it("attribution: admin can record an event + audit written", async () => {
    useTestDb();
    asAdmin();
    const res = await attribution(
      jsonRequest(`${BASE}/attribution`, "POST", {
        event_type: "manual",
        partner_id: "11111111-1111-1111-1111-111111111101",
        amount_cents: 12345,
        metadata: { note: "test" },
      }),
    );
    expect(res.status).toBe(201);
    const { event } = await res.json();
    expect(Number(event.amount_cents)).toBe(12345);
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'revenue_attribution_events' and entity_id = $1",
      [event.id],
    );
    expect(audits.map((a) => a.action)).toContain("revenue.attribution_recorded");
  });
});
