/**
 * AgentRunner idempotency: re-triggering with the same idempotency key returns
 * the existing run and does NOT create a second run or duplicate side effects.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunner } from "@/lib/agents/runner";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const PARTNER = "11111111-1111-1111-1111-111111111101";

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("AgentRunner idempotency", () => {
  let runner: AgentRunner;

  beforeAll(() => {
    runner = new AgentRunner({ db: getTestServiceDb() });
  });

  it("dedupes enqueue on the same idempotency key (no double run)", async () => {
    const input = { partnerId: PARTNER };
    const first = await runner.enqueue("due-diligence", input, {
      entityId: PARTNER,
      relatedPartnerId: PARTNER,
    });
    expect(first.deduped).toBe(false);

    const second = await runner.enqueue("due-diligence", input, {
      entityId: PARTNER,
      relatedPartnerId: PARTNER,
    });
    expect(second.deduped).toBe(true);
    expect(second.run.id).toBe(first.run.id);

    const runs = await query<{ id: string }>(
      "select id from agent_runs where idempotency_key = $1",
      [first.run.idempotency_key],
    );
    expect(runs).toHaveLength(1);
  });

  it("executing twice does not create duplicate DD reviews (idempotent side effect)", async () => {
    const input = { partnerId: PARTNER };
    const { run, task } = await runner.enqueue("due-diligence", input, {
      entityId: `${PARTNER}-exec`,
      relatedPartnerId: PARTNER,
    });
    await runner.execute(task.id);

    const before = await query<{ count: string }>(
      "select count(*)::text as count from due_diligence_reviews where partner_id = $1",
      [PARTNER],
    );

    // Re-enqueue is a no-op (dedupe); the run is already terminal.
    const again = await runner.enqueue("due-diligence", input, {
      entityId: `${PARTNER}-exec`,
      relatedPartnerId: PARTNER,
    });
    expect(again.deduped).toBe(true);
    expect(again.run.id).toBe(run.id);

    const after = await query<{ count: string }>(
      "select count(*)::text as count from due_diligence_reviews where partner_id = $1",
      [PARTNER],
    );
    // No new review from the dedupe path.
    expect(after[0].count).toBe(before[0].count);
  });
});
