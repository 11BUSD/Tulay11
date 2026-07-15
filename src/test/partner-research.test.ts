/**
 * Partner Research agent: populates sources + fit summary from the seed partner,
 * writes an audit row, uses the mock LLM (no network).
 */
import { afterAll, describe, expect, it } from "vitest";
import { partnerResearchAgent } from "@/lib/agents/impl/partner-research";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const PARTNER = "11111111-1111-1111-1111-111111111101";

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("partner-research agent", () => {
  it("enriches a partner + cites sources + audits", async () => {
    const runId = await createRunRow("partner-research");
    const ctx = testAgentContext(runId);

    const result = await partnerResearchAgent.run(ctx, { partnerId: PARTNER });
    expect(result.outputJson.partnerId).toBe(PARTNER);
    expect(result.outputJson.fitSummary.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);

    // Sources include the partner DB record + the LLM call.
    const kinds = result.dataSources.map((s) => s.kind);
    expect(kinds).toContain("db");
    expect(kinds).toContain("llm");
    expect(result.dataSources.some((s) => s.ref === `partners:${PARTNER}`)).toBe(true);

    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("agent.partner_research");
  });

  it("rejects input missing both ids", () => {
    expect(partnerResearchAgent.inputSchema.safeParse({}).success).toBe(false);
  });
});
