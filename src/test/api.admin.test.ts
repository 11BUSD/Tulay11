/**
 * Integration tests for the admin dashboard BFF routes (Tasks 19-21) and the
 * admin role guard:
 *   - revenue analytics groups by each of the six dimensions (AC9) and returns
 *     the payout-liability summary,
 *   - the append-only audit-log + consent-record read routes are admin-only,
 *   - the admin guard rejects anon (401) / non-admin (403) and the
 *     test-injected resolver overrides the real Supabase default resolver.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { GET as revenueGet } from "@/app/api/admin/revenue/route";
import { GET as auditLogsGet } from "@/app/api/admin/audit-logs/route";
import { GET as consentRecordsGet } from "@/app/api/admin/consent-records/route";
import {
  asAdmin,
  asAnon,
  asUser,
  getRequest,
  resetHarness,
  useTestDb,
} from "./api-harness";
import { closeTestPool, query } from "./db";
import {
  ensureActorResolver,
  resetActorResolver,
  resolveActor,
  setActorResolver,
} from "@/lib/auth/roles";
import { REVENUE_DIMENSIONS } from "@/lib/api/admin/revenue";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const BASE = "http://localhost/api/admin";

const PARTNER_ID = "11111111-1111-1111-1111-111111111101";

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

// --- Role guard resolver precedence (does not need the DB) -------------------
describe("admin role guard resolver precedence (AC6)", () => {
  afterEach(() => resetActorResolver());

  it("a test-injected resolver overrides the real default fallback", async () => {
    // Simulate app startup installing the real Supabase-backed default.
    const fallback = async () =>
      ({ id: "supabase-user", role: "user", actorType: "human" }) as const;
    ensureActorResolver(fallback);
    // Fallback wins when nothing was injected.
    expect((await resolveActor())?.id).toBe("supabase-user");

    // A test injects an admin — must take precedence over the default.
    const injected = asAdmin();
    // ensureActorResolver must NOT clobber the injected resolver.
    ensureActorResolver(fallback);
    const actor = await resolveActor();
    expect(actor?.id).toBe(injected.id);
    expect(actor?.role).toBe("admin");
  });

  it("resetActorResolver returns to the fail-closed default (null actor)", async () => {
    setActorResolver(async () => ({
      id: "x",
      role: "admin",
      actorType: "human",
    }));
    resetActorResolver();
    expect(await resolveActor()).toBeNull();
  });
});

describe.skipIf(!hasDb)("admin BFF routes", () => {
  beforeAll(() => useTestDb());
  // resetHarness() (afterEach) clears the injected DB; re-point each test at the
  // test Postgres so route handlers' getServiceDb() hits the same database the
  // `query` helper writes to.
  beforeEach(() => useTestDb());

  // --- Revenue analytics (AC9) ----------------------------------------------
  describe("GET /api/admin/revenue", () => {
    it("rejects anon (401) and non-admin (403)", async () => {
      resetHarness();
      useTestDb();
      asAnon();
      let res = await revenueGet(getRequest(`${BASE}/revenue`));
      expect(res.status).toBe(401);

      asUser();
      res = await revenueGet(getRequest(`${BASE}/revenue`));
      expect(res.status).toBe(403);
    });

    it("rejects an unknown groupBy with 400", async () => {
      asAdmin();
      const res = await revenueGet(getRequest(`${BASE}/revenue?groupBy=bogus`));
      expect(res.status).toBe(400);
    });

    it("groups by every supported dimension and returns liability", async () => {
      asAdmin();
      // Seed one revenue event so aggregation has something to group.
      await query(
        `insert into revenue_attribution_events
           (event_type, partner_id, amount_cents, currency, metadata)
         values ('manual', $1, 12345, 'CAD', '{"channel":"seo"}'::jsonb)`,
        [PARTNER_ID],
      );

      for (const dim of REVENUE_DIMENSIONS) {
        const res = await revenueGet(
          getRequest(`${BASE}/revenue?groupBy=${dim}`),
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.groupBy).toBe(dim);
        expect(typeof body.total_cents).toBe("number");
        expect(Array.isArray(body.slices)).toBe(true);
        expect(body.payout_liability).toHaveProperty("unpaid_cents");
        expect(body.payout_liability).toHaveProperty("by_status");
      }

      // The seeded 12345-cent event is reflected in the partner-grouped total.
      const byPartner = await revenueGet(
        getRequest(`${BASE}/revenue?groupBy=partner`),
      );
      const body = await byPartner.json();
      expect(body.total_cents).toBeGreaterThanOrEqual(12345);
    });
  });

  // --- Audit log (append-only) ----------------------------------------------
  describe("GET /api/admin/audit-logs", () => {
    it("is admin-only", async () => {
      asUser();
      const res = await auditLogsGet(getRequest(`${BASE}/audit-logs`));
      expect(res.status).toBe(403);
    });

    it("returns paginated logs for an admin", async () => {
      asAdmin();
      const res = await auditLogsGet(getRequest(`${BASE}/audit-logs?limit=5`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.logs)).toBe(true);
      expect(body.pagination).toMatchObject({ limit: 5, offset: 0 });
      expect(typeof body.pagination.total).toBe("number");
    });
  });

  // --- Consent ledger (AC7) -------------------------------------------------
  describe("GET /api/admin/consent-records", () => {
    it("is admin-only", async () => {
      asAnon();
      const res = await consentRecordsGet(getRequest(`${BASE}/consent-records`));
      expect(res.status).toBe(401);
    });

    it("returns latest-per-subject by default and full history with ?all=true", async () => {
      asAdmin();
      let res = await consentRecordsGet(
        getRequest(`${BASE}/consent-records`),
      );
      expect(res.status).toBe(200);
      let body = await res.json();
      expect(body.latestPerSubject).toBe(true);
      expect(Array.isArray(body.records)).toBe(true);

      res = await consentRecordsGet(
        getRequest(`${BASE}/consent-records?all=true`),
      );
      body = await res.json();
      expect(body.latestPerSubject).toBe(false);
    });
  });
});
