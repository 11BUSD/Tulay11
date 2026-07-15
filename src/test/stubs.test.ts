/**
 * Stub agents: return needs_review + "not implemented" reasoning, write an
 * audit row, and produce NO other side effects (no offers/messages/DD rows).
 */
import { afterAll, describe, expect, it } from "vitest";
import { stubAgents, STUB_AGENT_KEYS } from "@/lib/agents/impl/stubs";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("stub agents", () => {
  it("has 8 stubs", () => {
    expect(stubAgents).toHaveLength(8);
    expect(STUB_AGENT_KEYS).toHaveLength(8);
  });

  it("each stub returns needs_review + not-implemented reasoning + audit, no side effects", async () => {
    for (const agent of stubAgents) {
      const runId = await createRunRow(agent.key);
      const ctx = testAgentContext(runId);

      const result = await agent.run(ctx, {});
      expect(result.status).toBe("needs_review");
      expect(result.confidence).toBe(0);
      expect(result.reasoningSummary).toMatch(/not implemented in Phase-2 MVP/i);

      // Audit written.
      const audits = await query<{ action: string }>(
        "select action from audit_logs where agent_run_id = $1",
        [runId],
      );
      expect(audits.map((a) => a.action)).toContain("agent.stub_invoked");

      // No side effects tied to this run: no offers or messages reference it,
      // and the only audit row is the stub-invoked marker.
      const [offersForRun] = await query<{ count: string }>(
        "select count(*)::text as count from partner_offers where source_agreement_id = $1",
        [runId],
      );
      expect(offersForRun.count).toBe("0");
      const [messagesForRun] = await query<{ count: string }>(
        "select count(*)::text as count from outreach_messages where generated_by_run_id = $1",
        [runId],
      );
      expect(messagesForRun.count).toBe("0");
      expect(audits).toHaveLength(1);
    }
  });
});
