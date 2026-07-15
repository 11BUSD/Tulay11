/**
 * Outreach Sequencing agent:
 *   - schedules a follow-up `outreach-drafting` task for a sent message,
 *   - stamps `follow_up_due_at` on the sent message,
 *   - NEVER sends (only schedules DRAFT tasks),
 *   - skips suppressed contacts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { outreachSequencingAgent } from "@/lib/agents/impl/outreach-sequencing";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

async function newCampaign(): Promise<string> {
  const [c] = await query<{ id: string }>(
    `insert into outreach_campaigns (name) values ('[TEST] Sequencing') returning id`,
  );
  return c.id;
}
async function newContact(consent = "opted_in"): Promise<string> {
  const email = `seq-${Date.now()}-${Math.random()}@example.com`;
  const [c] = await query<{ id: string }>(
    `insert into outreach_contacts (name, email, consent_status) values ('[TEST]',$1,$2) returning id`,
    [email, consent],
  );
  return c.id;
}
async function newSentMessage(campaignId: string, contactId: string): Promise<string> {
  const [m] = await query<{ id: string }>(
    `insert into outreach_messages (campaign_id, contact_id, direction, state, sent_at)
     values ($1,$2,'outbound','sent', now() - interval '10 days') returning id`,
    [campaignId, contactId],
  );
  return m.id;
}

describe.skipIf(!hasDb)("outreach-sequencing agent", () => {
  it("schedules a follow-up draft task + stamps follow_up_due_at; never sends", async () => {
    const campaignId = await newCampaign();
    const contactId = await newContact();
    const messageId = await newSentMessage(campaignId, contactId);
    const runId = await createRunRow("outreach-sequencing");
    const ctx = testAgentContext(runId, { now: new Date() });

    const result = await outreachSequencingAgent.run(ctx, { campaignId, followUpDelayMs: 3 * 24 * 60 * 60 * 1000 });
    expect(result.outputJson.scheduled).toBe(1);
    expect(result.outputJson.scheduledTaskIds).toHaveLength(1);

    // A follow-up drafting task was queued.
    const [task] = await query<{ task_key: string; status: string }>(
      "select task_key, status from agent_tasks where id = $1",
      [result.outputJson.scheduledTaskIds[0]],
    );
    expect(task.task_key).toBe("outreach-drafting");
    expect(task.status).toBe("queued");

    // follow_up_due_at stamped on the sent message.
    const [row] = await query<{ follow_up_due_at: string | null; state: string }>(
      "select follow_up_due_at, state from outreach_messages where id = $1",
      [messageId],
    );
    expect(row.follow_up_due_at).not.toBeNull();
    // Still 'sent' — sequencing never advances/sends.
    expect(row.state).toBe("sent");

    // No message was sent by this run.
    const [count] = await query<{ count: string }>(
      "select count(*)::text as count from outreach_messages where generated_by_run_id = $1",
      [runId],
    );
    expect(count.count).toBe("0");

    // Audit written.
    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("agent.outreach_sequencing");
  });

  it("skips a suppressed contact", async () => {
    const campaignId = await newCampaign();
    const contactId = await newContact("opted_out");
    await newSentMessage(campaignId, contactId);
    const runId = await createRunRow("outreach-sequencing");

    const result = await outreachSequencingAgent.run(testAgentContext(runId), {
      campaignId,
      followUpDelayMs: 3 * 24 * 60 * 60 * 1000,
    });
    expect(result.outputJson.scheduled).toBe(0);
    expect(result.outputJson.skipped).toBe(1);
  });
});
