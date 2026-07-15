/**
 * AgentRunner restart: a task locked by a dead worker (expired lock) is
 * reclaimable and resumes without duplicating side effects.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunner } from "@/lib/agents/runner";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const PARTNER = "11111111-1111-1111-1111-111111111102";

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("AgentRunner restart / expired-lock reclaim", () => {
  let runner: AgentRunner;
  beforeAll(() => {
    runner = new AgentRunner({ db: getTestServiceDb(), workerId: "worker-A" });
  });

  it("does not claim a task whose lock is still live", async () => {
    const { task } = await runner.enqueue(
      "due-diligence",
      { partnerId: PARTNER },
      { entityId: `${PARTNER}-live`, relatedPartnerId: PARTNER },
    );
    // Simulate an in-flight claim by worker-A with a fresh lock.
    await query(
      "update agent_tasks set status='running', locked_by='worker-A', locked_at=now(), lock_expires_at=now() + interval '10 min' where id=$1",
      [task.id],
    );

    const claimed = await runner.claim(5);
    expect(claimed.find((t) => t.id === task.id)).toBeUndefined();
  });

  it("reclaims an expired-lock task and resumes without double side effect", async () => {
    const { run, task } = await runner.enqueue(
      "due-diligence",
      { partnerId: PARTNER },
      { entityId: `${PARTNER}-expired`, relatedPartnerId: PARTNER },
    );
    // Simulate a dead worker: running with an EXPIRED lock.
    await query(
      "update agent_tasks set status='running', locked_by='dead-worker', locked_at=now() - interval '20 min', lock_expires_at=now() - interval '10 min' where id=$1",
      [task.id],
    );

    const before = await query<{ count: string }>(
      "select count(*)::text as count from due_diligence_reviews where partner_id = $1",
      [PARTNER],
    );

    // A live worker reclaims it.
    const claimed = await runner.claim(5);
    const mine = claimed.find((t) => t.id === task.id);
    expect(mine).toBeDefined();
    expect(mine!.locked_by).toBe("worker-A");

    const finished = await runner.execute(task.id);
    expect(finished.id).toBe(run.id);
    expect(["succeeded", "needs_review"]).toContain(finished.status);

    const after = await query<{ count: string }>(
      "select count(*)::text as count from due_diligence_reviews where partner_id = $1",
      [PARTNER],
    );
    // Exactly one DD review created by the single (resumed) execution.
    expect(Number(after[0].count) - Number(before[0].count)).toBe(1);
  });
});
