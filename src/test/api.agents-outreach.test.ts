/**
 * Integration tests for the Agent-orchestration + Outreach routes (Task 13):
 *   - admin guard: non-admin (401 anon / 403 user) rejected on every route,
 *   - CSV import creates contacts + writes audit,
 *   - agents/run executes inline + is idempotency-keyed (dedupe returns 200),
 *   - agents/runs list + detail,
 *   - approval queue: approve is BLOCKED when a blocking risk flag is present,
 *   - send gate: send rejected unless state=approved; a sent message is simulated,
 *   - replies: sent -> replied (+ meeting_booked),
 *   - audit: state changes write audit rows.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as importPost } from "@/app/api/outreach/import/route";
import { POST as agentsRun } from "@/app/api/agents/run/route";
import { GET as runsList } from "@/app/api/agents/runs/route";
import { GET as runDetail } from "@/app/api/agents/runs/[id]/route";
import { GET as messagesList } from "@/app/api/outreach/messages/route";
import { POST as approve } from "@/app/api/outreach/messages/[id]/approve/route";
import { POST as reject } from "@/app/api/outreach/messages/[id]/reject/route";
import { POST as send } from "@/app/api/outreach/messages/[id]/send/route";
import { POST as replies } from "@/app/api/outreach/replies/route";
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
const PARTNER = "11111111-1111-1111-1111-111111111101";

afterEach(() => resetHarness());
afterAll(async () => {
  if (hasDb) await closeTestPool();
});

async function newCampaign(): Promise<string> {
  const [c] = await query<{ id: string }>(
    `insert into outreach_campaigns (name) values ('[TEST] API') returning id`,
  );
  return c.id;
}
async function newContact(consent = "opted_in"): Promise<string> {
  const email = `apio-${Date.now()}-${Math.random()}@example.com`;
  const [c] = await query<{ id: string }>(
    `insert into outreach_contacts (name, email, consent_status) values ('[TEST]',$1,$2) returning id`,
    [email, consent],
  );
  return c.id;
}
async function newDraft(
  campaignId: string,
  contactId: string,
  riskFlags: unknown[] = [],
): Promise<string> {
  const [m] = await query<{ id: string }>(
    `insert into outreach_messages
       (campaign_id, contact_id, direction, subject, body, state, draft_risk_flags)
     values ($1,$2,'outbound','Hi','Hello from Tulay. Reply STOP to opt out.','drafted',$3)
     returning id`,
    [campaignId, contactId, JSON.stringify(riskFlags)],
  );
  return m.id;
}

describe.skipIf(!hasDb)("agents + outreach routes", () => {
  beforeAll(() => useTestDb());

  it("rejects non-admin (401 anon, 403 user) on the routes", async () => {
    resetHarness();
    useTestDb();
    let res = await runsList(getRequest(`${BASE}/agents/runs`));
    expect(res.status).toBe(401);
    res = await messagesList(getRequest(`${BASE}/outreach/messages`));
    expect(res.status).toBe(401);

    asUser();
    res = await agentsRun(
      jsonRequest(`${BASE}/agents/run`, "POST", {
        agent_key: "partner-research",
        input: { partnerId: PARTNER },
      }),
    );
    expect(res.status).toBe(403);
    res = await importPost(
      jsonRequest(`${BASE}/outreach/import`, "POST", { csv: "email\na@b.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("CSV import creates contacts + writes an audit row", async () => {
    useTestDb();
    asAdmin();
    const uniq = `${Date.now()}-${Math.random()}`;
    const csv = `name,email,role\nAlpha,imp-${uniq}@example.com,CEO\n`;
    const res = await importPost(
      jsonRequest(`${BASE}/outreach/import`, "POST", { csv }),
    );
    expect(res.status).toBe(201);
    const { result } = await res.json();
    expect(result.created).toBe(1);

    const audits = await query<{ action: string }>(
      "select action from audit_logs where action = 'outreach.contacts_imported' order by created_at desc limit 1",
    );
    expect(audits.map((a) => a.action)).toContain("outreach.contacts_imported");
  });

  it("agents/run executes inline and is idempotency-keyed", async () => {
    useTestDb();
    asAdmin();
    const body = {
      agent_key: "partner-research",
      input: { partnerId: PARTNER },
      entity_id: PARTNER,
      related_partner_id: PARTNER,
    };
    const first = await agentsRun(jsonRequest(`${BASE}/agents/run`, "POST", body));
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.deduped).toBe(false);
    expect(["succeeded", "needs_review"]).toContain(firstBody.status);

    // Same input → deduped (200), same runId, no second run.
    const second = await agentsRun(jsonRequest(`${BASE}/agents/run`, "POST", body));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.deduped).toBe(true);
    expect(secondBody.runId).toBe(firstBody.runId);
  });

  it("agents/runs list + detail", async () => {
    useTestDb();
    asAdmin();
    await agentsRun(
      jsonRequest(`${BASE}/agents/run`, "POST", {
        agent_key: "partner-research",
        input: { partnerId: PARTNER },
        related_partner_id: PARTNER,
      }),
    );
    const listRes = await runsList(
      getRequest(`${BASE}/agents/runs?agentKey=partner-research`),
    );
    expect(listRes.status).toBe(200);
    const { runs } = await listRes.json();
    expect(runs.length).toBeGreaterThan(0);
    const runId = runs[0].id as string;

    const detailRes = await runDetail(
      getRequest(`${BASE}/agents/runs/${runId}`),
      ctx(runId),
    );
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.run.id).toBe(runId);
    expect(Array.isArray(detail.tasks)).toBe(true);
  });

  it("approval queue: approve blocked by a blocking risk flag (422)", async () => {
    useTestDb();
    asAdmin();
    const campaignId = await newCampaign();
    const contactId = await newContact();
    const blocked = await newDraft(campaignId, contactId, [
      { code: "casl_missing_optout", severity: "high", message: "no opt-out" },
    ]);

    const res = await approve(
      jsonRequest(`${BASE}/outreach/messages/${blocked}/approve`, "POST", {}),
      ctx(blocked),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("blocking_risk_flags");

    // Still drafted (not approved).
    const [row] = await query<{ state: string }>(
      "select state from outreach_messages where id = $1",
      [blocked],
    );
    expect(row.state).toBe("drafted");
  });

  it("approve (clean) -> approved with audit; then send gate + simulated send", async () => {
    useTestDb();
    asAdmin();
    const campaignId = await newCampaign();
    const contactId = await newContact();
    const clean = await newDraft(campaignId, contactId, []);

    // Send is rejected while still drafted (approval gate).
    const preSend = await send(
      jsonRequest(`${BASE}/outreach/messages/${clean}/send`, "POST", {}),
      ctx(clean),
    );
    expect(preSend.status).toBe(422);
    expect((await preSend.json()).code).toBe("not_approved");

    // Approve.
    const appr = await approve(
      jsonRequest(`${BASE}/outreach/messages/${clean}/approve`, "POST", {}),
      ctx(clean),
    );
    expect(appr.status).toBe(200);
    expect((await appr.json()).message.state).toBe("approved");

    // Send (simulated, never network).
    const sent = await send(
      jsonRequest(`${BASE}/outreach/messages/${clean}/send`, "POST", {}),
      ctx(clean),
    );
    expect(sent.status).toBe(200);
    const sentBody = await sent.json();
    expect(sentBody.message.state).toBe("sent");
    expect(sentBody.dispatch.simulated).toBe(true);
    expect(sentBody.dispatch.providerMessageId).toBeTruthy();

    // Audit rows for approved + sent state changes.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'outreach_messages' and entity_id = $1",
      [clean],
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("outreach.state.approved");
    expect(actions).toContain("outreach.state.sent");
  });

  it("reject transitions drafted -> rejected", async () => {
    useTestDb();
    asAdmin();
    const campaignId = await newCampaign();
    const contactId = await newContact();
    const draft = await newDraft(campaignId, contactId, []);

    const res = await reject(
      jsonRequest(`${BASE}/outreach/messages/${draft}/reject`, "POST", {
        reason: "off-brand",
      }),
      ctx(draft),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message.state).toBe("rejected");
  });

  it("replies: sent -> replied (+ meeting_booked)", async () => {
    useTestDb();
    asAdmin();
    const campaignId = await newCampaign();
    const contactId = await newContact();
    const [m] = await query<{ id: string }>(
      `insert into outreach_messages (campaign_id, contact_id, direction, state, sent_at)
       values ($1,$2,'outbound','sent', now()) returning id`,
      [campaignId, contactId],
    );

    const res = await replies(
      jsonRequest(`${BASE}/outreach/replies`, "POST", {
        message_id: m.id,
        body: "Interested!",
        meeting_booked: true,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).message.state).toBe("meeting_booked");
  });
});
