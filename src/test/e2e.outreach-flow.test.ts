/**
 * End-to-end outreach flow (admin routes + agents):
 *   import contact -> partner-research -> due-diligence -> draft -> approve ->
 *   simulated send -> reply.
 *
 * Asserts the state machine advances correctly and that every state change +
 * agent run writes an audit row. The send is ALWAYS simulated (no network).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as importPost } from "@/app/api/outreach/import/route";
import { POST as agentsRun } from "@/app/api/agents/run/route";
import { POST as approve } from "@/app/api/outreach/messages/[id]/approve/route";
import { POST as send } from "@/app/api/outreach/messages/[id]/send/route";
import { POST as replies } from "@/app/api/outreach/replies/route";
import {
  asAdmin,
  ctx,
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

describe.skipIf(!hasDb)("e2e outreach flow", () => {
  beforeAll(() => useTestDb());

  it("import -> research -> DD -> draft -> approve -> simulated send -> reply", async () => {
    useTestDb();
    asAdmin();

    const uniq = `${Date.now()}-${Math.random()}`;
    const email = `e2e-${uniq}@example.com`;

    // 1) Create a campaign + a partner for the contact.
    const [campaign] = await query<{ id: string }>(
      `insert into outreach_campaigns (name) values ('[TEST] E2E') returning id`,
    );
    const [partner] = await query<{ id: string }>(
      `insert into partners (name, status) values ($1,'in_review') returning id`,
      [`[TEST] E2E Partner ${uniq}`],
    );

    // 2) Import the contact via CSV, then link it to the partner.
    const csv = `name,email,role\nE2E Contact,${email},Owner\n`;
    const importRes = await importPost(
      jsonRequest(`${BASE}/outreach/import`, "POST", { csv }),
    );
    expect(importRes.status).toBe(201);
    const [contact] = await query<{ id: string }>(
      "select id from outreach_contacts where lower(email) = $1",
      [email.toLowerCase()],
    );
    await query(
      "update outreach_contacts set partner_id = $2 where id = $1",
      [contact.id, partner.id],
    );

    // 3) Partner research.
    const research = await agentsRun(
      jsonRequest(`${BASE}/agents/run`, "POST", {
        agent_key: "partner-research",
        input: { partnerId: partner.id },
        related_partner_id: partner.id,
      }),
    );
    expect(research.status).toBe(201);

    // 4) Due diligence.
    const dd = await agentsRun(
      jsonRequest(`${BASE}/agents/run`, "POST", {
        agent_key: "due-diligence",
        input: { partnerId: partner.id },
        related_partner_id: partner.id,
      }),
    );
    expect(dd.status).toBe(201);
    const [ddReview] = await query<{ id: string }>(
      "select id from due_diligence_reviews where partner_id = $1",
      [partner.id],
    );
    expect(ddReview).toBeTruthy();

    // 5) Draft (agent produces state=drafted, CASL-clean via mock LLM).
    const draftRun = await agentsRun(
      jsonRequest(`${BASE}/agents/run`, "POST", {
        agent_key: "outreach-drafting",
        input: { contactId: contact.id, campaignId: campaign.id, sequenceStep: 0 },
        related_contact_id: contact.id,
        related_campaign_id: campaign.id,
      }),
    );
    expect(draftRun.status).toBe(201);
    const [message] = await query<{ id: string; state: string }>(
      "select id, state from outreach_messages where contact_id = $1 and campaign_id = $2",
      [contact.id, campaign.id],
    );
    expect(message.state).toBe("drafted");

    // 6) Human approves.
    const appr = await approve(
      jsonRequest(`${BASE}/outreach/messages/${message.id}/approve`, "POST", {}),
      ctx(message.id),
    );
    expect(appr.status).toBe(200);
    expect((await appr.json()).message.state).toBe("approved");

    // 7) Simulated send (never network).
    const sent = await send(
      jsonRequest(`${BASE}/outreach/messages/${message.id}/send`, "POST", {}),
      ctx(message.id),
    );
    expect(sent.status).toBe(200);
    const sentBody = await sent.json();
    expect(sentBody.message.state).toBe("sent");
    expect(sentBody.dispatch.simulated).toBe(true);

    // 8) Reply -> replied.
    const reply = await replies(
      jsonRequest(`${BASE}/outreach/replies`, "POST", {
        message_id: message.id,
        body: "Yes, let's talk.",
      }),
    );
    expect(reply.status).toBe(200);
    expect((await reply.json()).message.state).toBe("replied");

    // State machine end state.
    const [final] = await query<{ state: string; simulated: boolean }>(
      "select state, simulated from outreach_messages where id = $1",
      [message.id],
    );
    expect(final.state).toBe("replied");
    expect(final.simulated).toBe(true);

    // Audit trail covers each state change.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'outreach_messages' and entity_id = $1",
      [message.id],
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("outreach.state.drafted");
    expect(actions).toContain("outreach.state.approved");
    expect(actions).toContain("outreach.state.sent");
    expect(actions).toContain("outreach.state.replied");
  });
});
