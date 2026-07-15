/**
 * DB-backed tests for recordAudit. Runs against TEST_DATABASE_URL (skipped when
 * no DB is configured). Asserts all fields persist and that agent-sourced rows
 * without reasoning throw — the guard is asserted, never weakened.
 */
import { afterAll, describe, expect, it } from "vitest";
import { recordAudit } from "@/lib/audit";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("recordAudit", () => {
  const db = () => getTestServiceDb();

  it("writes all fields", async () => {
    const entityId = `audit-${Date.now()}`;
    await recordAudit(
      {
        actorId: "11111111-1111-1111-1111-111111111111",
        actorType: "human",
        action: "money.referral_recorded",
        entityType: "payouts",
        entityId,
        before: { status: "pending" },
        after: { status: "approved" },
        sourceMeta: { ip_hash: "v1:abc" },
      },
      db(),
    );

    const [row] = await query<{
      actor_id: string;
      actor_type: string;
      action: string;
      entity_type: string;
      before: unknown;
      after: unknown;
      source_meta: unknown;
    }>("select * from audit_logs where entity_id = $1", [entityId]);

    expect(row.actor_type).toBe("human");
    expect(row.action).toBe("money.referral_recorded");
    expect(row.entity_type).toBe("payouts");
    expect(row.before).toEqual({ status: "pending" });
    expect(row.after).toEqual({ status: "approved" });
    expect(row.source_meta).toEqual({ ip_hash: "v1:abc" });
  });

  it("throws for an agent action without reasoning", async () => {
    await expect(
      recordAudit(
        {
          actorType: "agent",
          action: "outreach.drafted",
          entityType: "outreach_messages",
          entityId: "x",
        },
        db(),
      ),
    ).rejects.toThrow(/reasoning is required/);
  });

  it("accepts an agent action with reasoning", async () => {
    const entityId = `audit-agent-${Date.now()}`;
    await recordAudit(
      {
        actorType: "agent",
        action: "outreach.drafted",
        entityType: "outreach_messages",
        entityId,
        reasoning: "Drafted a follow-up based on prior reply.",
      },
      db(),
    );
    const [row] = await query<{ reasoning: string }>(
      "select reasoning from audit_logs where entity_id = $1",
      [entityId],
    );
    expect(row.reasoning).toMatch(/follow-up/);
  });

  it("links to an existing agent_run when agentRunId is set", async () => {
    const [run] = await query<{ id: string }>(
      "insert into agent_runs (agent_key, status) values ('test-agent', 'succeeded') returning id",
    );
    const entityId = `audit-run-${Date.now()}`;
    await recordAudit(
      {
        actorType: "agent",
        action: "outreach.drafted",
        entityType: "outreach_messages",
        entityId,
        reasoning: "Linked to a run.",
        agentRunId: run.id,
      },
      db(),
    );
    const [row] = await query<{ agent_run_id: string }>(
      "select agent_run_id from audit_logs where entity_id = $1",
      [entityId],
    );
    expect(row.agent_run_id).toBe(run.id);
  });

  it("writes in the same transaction as a state change (rolls back together)", async () => {
    const entityId = `audit-tx-${Date.now()}`;
    await expect(
      db().transaction(async (tx) => {
        await recordAudit(
          {
            actorType: "system",
            action: "test.tx",
            entityType: "test",
            entityId,
          },
          tx,
        );
        throw new Error("boom"); // force rollback
      }),
    ).rejects.toThrow("boom");

    const rows = await query("select 1 from audit_logs where entity_id = $1", [
      entityId,
    ]);
    expect(rows.length).toBe(0); // audit row rolled back with the transaction
  });
});
