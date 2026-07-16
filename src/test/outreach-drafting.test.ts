/**
 * Outreach Drafting agent (DRAFT ONLY):
 *   - produces a `drafted` message and never approved/sent,
 *   - stores the dedupe hash; a duplicate draft is rejected,
 *   - a CASL-failing draft carries blocking risk flags on the row,
 *   - a suppressed contact yields no draft.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { outreachDraftingAgent } from "@/lib/agents/impl/outreach-drafting";
import { DuplicateDraftError } from "@/lib/outreach/dedupe";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

async function newCampaign(): Promise<string> {
  const [c] = await query<{ id: string }>(
    `insert into outreach_campaigns (name) values ('[TEST] Drafting') returning id`,
  );
  return c.id;
}
async function newContact(consent = "opted_in"): Promise<{ id: string; email: string }> {
  const email = `draft-${Date.now()}-${Math.random()}@example.com`;
  const [c] = await query<{ id: string }>(
    `insert into outreach_contacts (name, email, consent_status) values ('[TEST]',$1,$2) returning id`,
    [email, consent],
  );
  return { id: c.id, email };
}

describe.skipIf(!hasDb)("outreach-drafting agent", () => {
  it("creates a CASL-clean draft in state=drafted (never approved/sent)", async () => {
    const campaignId = await newCampaign();
    const contact = await newContact();
    const runId = await createRunRow("outreach-drafting");
    const ctx = testAgentContext(runId);

    const result = await outreachDraftingAgent.run(ctx, {
      contactId: contact.id,
      campaignId,
      sequenceStep: 0,
    });

    expect(result.outputJson.blocked).toBe(false);
    expect(result.outputJson.messageId).toBeTruthy();
    expect(result.outputJson.dedupeHash.length).toBeGreaterThan(0);

    const [row] = await query<{ state: string; approved_at: string | null; sent_at: string | null }>(
      "select state, approved_at, sent_at from outreach_messages where id = $1",
      [result.outputJson.messageId],
    );
    expect(row.state).toBe("drafted");
    expect(row.approved_at).toBeNull();
    expect(row.sent_at).toBeNull();

    // Audit records the drafted state.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("outreach.state.drafted");
  });

  it("rejects a duplicate draft (same contact+campaign+step)", async () => {
    const campaignId = await newCampaign();
    const contact = await newContact();
    const run1 = await createRunRow("outreach-drafting");
    await outreachDraftingAgent.run(testAgentContext(run1), {
      contactId: contact.id,
      campaignId,
      sequenceStep: 0,
    });

    const run2 = await createRunRow("outreach-drafting");
    await expect(
      outreachDraftingAgent.run(testAgentContext(run2), {
        contactId: contact.id,
        campaignId,
        sequenceStep: 0,
      }),
    ).rejects.toBeInstanceOf(DuplicateDraftError);
  });

  it("does not draft for a suppressed contact", async () => {
    const campaignId = await newCampaign();
    const contact = await newContact("opted_out");
    const runId = await createRunRow("outreach-drafting");

    const result = await outreachDraftingAgent.run(testAgentContext(runId), {
      contactId: contact.id,
      campaignId,
      sequenceStep: 0,
    });

    expect(result.outputJson.messageId).toBeNull();
    expect(result.outputJson.blocked).toBe(true);
    expect(result.status).toBe("needs_review");

    const [count] = await query<{ count: string }>(
      "select count(*)::text as count from outreach_messages where generated_by_run_id = $1",
      [runId],
    );
    expect(count.count).toBe("0");
  });

  it("stores blocking CASL risk flags when the LLM draft is non-compliant", async () => {
    const campaignId = await newCampaign();
    const contact = await newContact();
    const runId = await createRunRow("outreach-drafting");
    const ctx = testAgentContext(runId);
    // Force a non-compliant draft: no sender/reason/opt-out.
    vi.spyOn(ctx.llm, "complete").mockResolvedValue({
      text: "{}",
      parsed: { subject: "Hi", body: "Click here now.", confidence: 0.6 },
      model: "mock",
      simulated: true,
    });

    const result = await outreachDraftingAgent.run(ctx, {
      contactId: contact.id,
      campaignId,
      sequenceStep: 0,
    });

    expect(result.outputJson.blocked).toBe(true);
    expect(result.riskFlags.some((f) => f.severity === "high")).toBe(true);

    const [row] = await query<{ state: string; draft_risk_flags: unknown }>(
      "select state, draft_risk_flags from outreach_messages where id = $1",
      [result.outputJson.messageId],
    );
    expect(row.state).toBe("drafted");
    const flags = row.draft_risk_flags as Array<{ severity: string }>;
    expect(flags.some((f) => f.severity === "high")).toBe(true);
  });
});
