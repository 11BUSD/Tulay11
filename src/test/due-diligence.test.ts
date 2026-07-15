/**
 * Due Diligence agent: writes a due_diligence_reviews row, populates sources,
 * audits, and lands high-risk verdicts in needs_review.
 */
import { afterAll, describe, expect, it } from "vitest";
import { dueDiligenceAgent } from "@/lib/agents/impl/due-diligence";
import { closeTestPool, query } from "./db";
import { createRunRow, testAgentContext } from "./agent-harness";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

async function makePartner(overrides: {
  licensed_required?: boolean;
  license_verified_at?: string | null;
}): Promise<string> {
  const [row] = await query<{ id: string }>(
    `insert into partners (name, licensed_required, license_verified_at, status)
     values ($1,$2,$3,'in_review') returning id`,
    [
      `[TEST] DD Partner ${Date.now()}-${Math.random()}`,
      overrides.licensed_required ?? false,
      overrides.license_verified_at ?? null,
    ],
  );
  return row.id;
}

describe.skipIf(!hasDb)("due-diligence agent", () => {
  it("writes a DD review with sources + audit", async () => {
    const partnerId = await makePartner({});
    const runId = await createRunRow("due-diligence");
    const ctx = testAgentContext(runId, { actorId: null });

    const result = await dueDiligenceAgent.run(ctx, { partnerId });
    expect(result.outputJson.reviewId).toBeTruthy();

    const reviews = await query<{ id: string; outcome: string }>(
      "select id, outcome from due_diligence_reviews where partner_id = $1",
      [partnerId],
    );
    expect(reviews).toHaveLength(1);
    expect(result.dataSources.some((s) => s.kind === "db")).toBe(true);

    const audits = await query<{ action: string }>(
      "select action from audit_logs where agent_run_id = $1",
      [runId],
    );
    expect(audits.map((a) => a.action)).toContain("agent.due_diligence");
  });

  it("a regulated-but-unverified partner is high-risk → needs_review", async () => {
    const partnerId = await makePartner({
      licensed_required: true,
      license_verified_at: null,
    });
    const runId = await createRunRow("due-diligence");
    const ctx = testAgentContext(runId);

    const result = await dueDiligenceAgent.run(ctx, { partnerId });
    expect(result.status).toBe("needs_review");
    expect(result.riskFlags.some((f) => f.severity === "high")).toBe(true);
  });
});
