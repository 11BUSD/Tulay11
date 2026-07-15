/**
 * AgentRunner override: an admin can force a run's status/output; the override
 * is audited as a human action and requires an actorId.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunner } from "@/lib/agents/runner";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const PARTNER = "11111111-1111-1111-1111-111111111103";
const ADMIN = "44444444-4444-4444-4444-444444444401";

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("AgentRunner override", () => {
  let runner: AgentRunner;
  beforeAll(() => {
    runner = new AgentRunner({ db: getTestServiceDb() });
  });

  it("forces status + output and writes a human audit row", async () => {
    const { run, task } = await runner.enqueue(
      "due-diligence",
      { partnerId: PARTNER },
      { entityId: `${PARTNER}-override`, relatedPartnerId: PARTNER },
    );
    await runner.execute(task.id);

    const overridden = await runner.override(run.id, {
      status: "cancelled",
      outputJson: { manual: true },
      reasoningSummary: "Admin cancelled after review",
      actorId: ADMIN,
      reason: "Not a fit; cancelling manually.",
    });
    expect(overridden.status).toBe("cancelled");

    const audits = await query<{ actor_type: string; action: string }>(
      "select actor_type, action from audit_logs where entity_type='agent_runs' and entity_id=$1 and action='agent.override'",
      [run.id],
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_type).toBe("human");
  });

  it("requires a human actorId", async () => {
    const { run } = await runner.enqueue(
      "due-diligence",
      { partnerId: PARTNER },
      { entityId: `${PARTNER}-override2`, relatedPartnerId: PARTNER },
    );
    await expect(
      runner.override(run.id, {
        status: "cancelled",
        actorId: "",
        reason: "no actor",
      }),
    ).rejects.toThrow(/human actorId/);
  });
});
