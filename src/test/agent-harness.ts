/**
 * Shared harness for agent-implementation tests.
 *
 * Builds a real `AgentContext` bound to the test DB + the MockLLMProvider so an
 * agent's `run()` can be exercised directly (without the full runner) against
 * `TEST_DATABASE_URL`. Also exposes `runViaRunner` for tests that want the full
 * enqueue→execute path.
 */
import { recordAudit } from "@/lib/audit";
import { MockLLMProvider } from "@/lib/agents/llm/mock";
import type { AgentContext, AgentAuditEntry } from "@/lib/agents/types";
import { getTestServiceDb } from "./db";

/** A fixed logical clock for deterministic tests. */
export const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

/** Build an AgentContext bound to the test DB + mock LLM. */
export function testAgentContext(
  runId: string,
  opts: { actorId?: string | null; now?: Date } = {},
): AgentContext {
  const db = getTestServiceDb();
  const now = opts.now ?? FIXED_NOW;
  const actorId = opts.actorId ?? null;
  return {
    db,
    llm: new MockLLMProvider(),
    runId,
    actorId,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    now: () => now,
    audit: async (entry: AgentAuditEntry) => {
      await recordAudit(
        {
          actorId,
          actorType: "agent",
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before,
          after: entry.after,
          reasoning: entry.reasoning,
          sourceMeta: entry.sourceMeta ?? null,
          agentRunId: runId,
        },
        db,
      );
    },
  };
}

/** Create a bare agent_runs row so audit's agent_run_id FK is satisfiable. */
export async function createRunRow(agentKey: string): Promise<string> {
  const db = getTestServiceDb();
  const [row] = await db.query<{ id: string }>(
    `insert into agent_runs (agent_key, agent_version, status) values ($1,'test','running') returning id`,
    [agentKey],
  );
  return row.id;
}
