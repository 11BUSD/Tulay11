/**
 * Integration tests for the consumer-app BFF routes (Tasks 14–18):
 *   - GET /api/pillars returns the 10 seeded pillar slugs (ordered),
 *   - GET /api/pillars/[slug] returns a regulated disclaimer for a regulated
 *     settlement pillar and the general disclosure otherwise,
 *   - POST /api/leads rejects (422 consent_required) without consent and
 *     writes a ConsentRecord + audit row when consent is granted,
 *   - GET/POST/DELETE /api/saved round-trip keyed by subjectRef,
 *   - GET/PATCH /api/profile round-trip (role never editable),
 *   - GET /r/[code] sets the attribution cookie + 302 for a valid code and
 *     redirects to landing (no cookie) for an unknown code,
 *   - POST /api/concierge/chat refuses regulated topics with a route-to-pro
 *     signal (no LLM call) and answers non-regulated topics.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GET as pillarsList } from "@/app/api/pillars/route";
import { GET as pillarGet } from "@/app/api/pillars/[slug]/route";
import { POST as leadsCreate } from "@/app/api/leads/route";
import {
  DELETE as savedDelete,
  GET as savedList,
  POST as savedCreate,
} from "@/app/api/saved/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/profile/route";
import { GET as referralResolve } from "@/app/r/[code]/route";
import { POST as conciergeChat } from "@/app/api/concierge/chat/route";
import { REFERRAL_COOKIE } from "@/lib/api/referrals";
import { buildLeadConsent } from "@/lib/consent/schema";
import {
  SEED_USER_ID,
  getRequest,
  jsonRequest,
  resetHarness,
  useTestDb,
} from "./api-harness";
import { closeTestPool } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const BASE = "http://localhost/api";

/** Dynamic-segment ctx factory for a `[slug]` / `[code]` route. */
function slugCtx<K extends string>(
  key: K,
  value: string,
): { params: Promise<Record<K, string>> } {
  return { params: Promise.resolve({ [key]: value } as Record<K, string>) };
}

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

const SEED_SLUGS = [
  "banking",
  "phone_internet",
  "housing",
  "tenant_insurance",
  "jobs",
  "healthcare",
  "tax_benefits",
  "transportation",
  "remittance",
  "community_life",
];

describe.skipIf(!hasDb)("consumer-app BFF routes", () => {
  beforeAll(() => useTestDb());

  it("GET /api/pillars returns the 10 seeded slugs", async () => {
    useTestDb();
    const res = await pillarsList();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      pillars: { slug: string; progress: { status: string; percent: number } }[];
    };
    expect(body.count).toBe(10);
    expect(body.pillars.map((p) => p.slug).sort()).toEqual(
      [...SEED_SLUGS].sort(),
    );
    // Progress is stubbed for every pillar.
    for (const p of body.pillars) {
      expect(p.progress).toEqual({ status: "not_started", percent: 0 });
    }
  });

  it("GET /api/pillars/[slug] returns a regulated disclaimer for tenant_insurance", async () => {
    useTestDb();
    const res = await pillarGet(
      getRequest(`${BASE}/pillars/tenant_insurance`),
      slugCtx("slug", "tenant_insurance"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      disclaimer: { pillar: string; requires_licensed_referral: boolean };
    };
    expect(body.disclaimer.pillar).toBe("insurance");
    expect(body.disclaimer.requires_licensed_referral).toBe(true);
  });

  it("GET /api/pillars/[slug] returns the general disclosure for a non-regulated pillar", async () => {
    useTestDb();
    const res = await pillarGet(
      getRequest(`${BASE}/pillars/banking`),
      slugCtx("slug", "banking"),
    );
    const body = (await res.json()) as {
      disclaimer: { pillar: string; requires_licensed_referral: boolean };
    };
    expect(body.disclaimer.pillar).toBe("general");
    expect(body.disclaimer.requires_licensed_referral).toBe(false);
  });

  it("GET /api/pillars/[slug] 404s for an unknown slug", async () => {
    useTestDb();
    const res = await pillarGet(
      getRequest(`${BASE}/pillars/nope`),
      slugCtx("slug", "nope"),
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/leads rejects with 422 consent_required when consent is not granted", async () => {
    useTestDb();
    const consent = { ...buildLeadConsent({ partnerName: "Acme", granted: false }) };
    const res = await leadsCreate(
      jsonRequest(`${BASE}/leads`, "POST", {
        name: "Maria Santos",
        email: "maria@example.com",
        pillar: "banking",
        partnerName: "Acme",
        consent,
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("consent_required");
  });

  it("POST /api/leads writes a ConsentRecord when consent is granted", async () => {
    useTestDb();
    const res = await leadsCreate(
      jsonRequest(`${BASE}/leads`, "POST", {
        name: "Maria Santos",
        email: "maria@example.com",
        pillar: "banking",
        partnerName: "Acme",
        consent: buildLeadConsent({ partnerName: "Acme", granted: true }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { consentId: string; status: string };
    expect(body.consentId).toBeTruthy();
    expect(body.status).toBe("received");
  });

  it("GET/POST/DELETE /api/saved round-trips by subjectRef", async () => {
    useTestDb();
    const subjectRef = `test-${Date.now()}`;

    // Empty to start.
    let listRes = await savedList(
      getRequest(`${BASE}/saved?subjectRef=${subjectRef}`),
    );
    expect(((await listRes.json()) as { count: number }).count).toBe(0);

    // Save a resource.
    const createRes = await savedCreate(
      jsonRequest(`${BASE}/saved`, "POST", {
        subjectRef,
        pillar: "banking",
        title: "A saved guide",
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; title: string };
    expect(created.title).toBe("A saved guide");

    // Now visible.
    listRes = await savedList(
      getRequest(`${BASE}/saved?subjectRef=${subjectRef}`),
    );
    const list = (await listRes.json()) as { count: number };
    expect(list.count).toBe(1);

    // Delete it.
    const delRes = await savedDelete(
      jsonRequest(`${BASE}/saved`, "DELETE", { subjectRef, id: created.id }),
    );
    expect(delRes.status).toBe(200);
    expect(((await delRes.json()) as { deleted: boolean }).deleted).toBe(true);

    // Deleting again 404s.
    const delAgain = await savedDelete(
      jsonRequest(`${BASE}/saved`, "DELETE", { subjectRef, id: created.id }),
    );
    expect(delAgain.status).toBe(404);
  });

  it("GET/PATCH /api/profile round-trips and never edits role", async () => {
    useTestDb();
    const res = await profileGet(
      getRequest(`${BASE}/profile?id=${SEED_USER_ID}`),
    );
    expect(res.status).toBe(200);
    const before = (await res.json()) as { role: string };

    const patchRes = await profilePatch(
      jsonRequest(`${BASE}/profile`, "PATCH", {
        id: SEED_USER_ID,
        displayName: "Updated Name",
        city: "Hamilton",
      }),
    );
    expect(patchRes.status).toBe(200);
    const after = (await patchRes.json()) as {
      displayName: string | null;
      city: string | null;
      role: string;
    };
    expect(after.displayName).toBe("Updated Name");
    expect(after.city).toBe("Hamilton");
    expect(after.role).toBe(before.role);
  });

  it("GET /r/[code] sets the attribution cookie + 302 for a valid code", async () => {
    useTestDb();
    const res = await referralResolve(
      getRequest("http://localhost/r/SEED-AMB-01"),
      slugCtx("code", "SEED-AMB-01"),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/onboarding");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${REFERRAL_COOKIE}=SEED-AMB-01`);
  });

  it("GET /r/[code] redirects to landing (no cookie) for an unknown code", async () => {
    useTestDb();
    const res = await referralResolve(
      getRequest("http://localhost/r/UNKNOWN"),
      slugCtx("code", "UNKNOWN"),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("POST /api/concierge/chat refuses regulated topics with a route-to-pro signal", async () => {
    useTestDb();
    const res = await conciergeChat(
      jsonRequest(`${BASE}/concierge/chat`, "POST", {
        message: "Can you give me tax advice about my CRA refund?",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      regulated: boolean;
      routeToPro?: { pillar: string };
    };
    expect(body.regulated).toBe(true);
    expect(body.routeToPro?.pillar).toBe("tax");
  });

  it("POST /api/concierge/chat answers a non-regulated topic", async () => {
    useTestDb();
    const res = await conciergeChat(
      jsonRequest(`${BASE}/concierge/chat`, "POST", {
        message: "How do I ride the bus in my city?",
      }),
    );
    const body = (await res.json()) as { regulated: boolean; reply: string };
    expect(body.regulated).toBe(false);
    expect(body.reply.length).toBeGreaterThan(0);
  });
});
