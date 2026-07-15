/**
 * Integration tests for GET /api/admin/analytics (Task 23).
 *
 * Admin-guarded: anon → 401, non-admin → 403. With an injected admin actor it
 * returns the full metrics payload (users/activation/funnel/conversion/revenue/
 * payout-liability/CAC-LTV/ambassadors), all money as integer cents.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as analyticsGet } from "@/app/api/admin/analytics/route";
import {
  asAdmin,
  asAnon,
  asUser,
  getRequest,
  resetHarness,
  useTestDb,
} from "./api-harness";
import { closeTestPool } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const URL_ = "http://localhost/api/admin/analytics";

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("GET /api/admin/analytics", () => {
  beforeEach(() => useTestDb());

  it("rejects anon (401) and non-admin (403)", async () => {
    asAnon();
    let res = await analyticsGet(getRequest(URL_));
    expect(res.status).toBe(401);

    asUser();
    res = await analyticsGet(getRequest(URL_));
    expect(res.status).toBe(403);
  });

  it("returns the metrics payload for an admin actor", async () => {
    asAdmin();
    const res = await analyticsGet(getRequest(URL_));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Core scalar metrics present and integer-typed.
    expect(typeof body.users).toBe("number");
    expect(typeof body.activated_users).toBe("number");
    expect(typeof body.activation_rate).toBe("number");
    expect(typeof body.clicks).toBe("number");
    expect(typeof body.conversions).toBe("number");
    expect(typeof body.conversion_rate).toBe("number");
    expect(Number.isInteger(body.revenue_cents)).toBe(true);
    expect(Number.isInteger(body.revenue_per_user_cents)).toBe(true);
    expect(Number.isInteger(body.payout_liability_cents)).toBe(true);
    expect(Number.isInteger(body.cac_cents)).toBe(true);

    // Collections present.
    expect(Array.isArray(body.pillar_funnel)).toBe(true);
    expect(Array.isArray(body.revenue_by_partner)).toBe(true);
    expect(Array.isArray(body.ambassadors)).toBe(true);
    expect(body.estimated).toContain("cac_cents");
  });
});
