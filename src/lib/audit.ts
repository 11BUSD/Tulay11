/**
 * Single audit helper — `recordAudit()`.
 *
 * Every money, outreach, consent, and partner-status write goes through this
 * one function so the `audit_logs` table is the complete, append-only record of
 * who changed what and why. Agent-sourced rows MUST carry `reasoning`
 * (enforced here — the helper throws otherwise) so no automated action lands
 * without a rationale.
 *
 * `recordAudit` accepts an optional `db` handle so callers can write the audit
 * row in the SAME transaction as the state change: pass the transactional
 * `ServiceDb` from `serviceDb.transaction(tx => ...)` and the audit row commits
 * (or rolls back) atomically with the change it describes.
 */
import { getServiceDb, type ServiceDb } from "./db/client";

/** Who performed the audited action. */
export type ActorType = "human" | "agent" | "system";

/** Input to `recordAudit`. Mirrors the `audit_logs` columns. */
export interface AuditInput {
  actorId?: string | null;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** Required when `actorType === 'agent'`. */
  reasoning?: string | null;
  sourceMeta?: Record<string, unknown> | null;
  /** Links this audit row to an agent run, when applicable. */
  agentRunId?: string | null;
}

/**
 * Insert an audit row. Throws when `actorType === 'agent'` and `reasoning` is
 * missing/empty — automated actions must always be explainable.
 *
 * @param input the audit fields.
 * @param db    optional existing `ServiceDb`/transaction handle so the audit
 *              write joins the same transaction as the state change. Defaults
 *              to the process-wide service DB.
 */
export async function recordAudit(
  input: AuditInput,
  db: ServiceDb = getServiceDb(),
): Promise<void> {
  if (input.actorType === "agent") {
    if (!input.reasoning || input.reasoning.trim() === "") {
      throw new Error(
        "recordAudit: reasoning is required when actorType is 'agent'",
      );
    }
  }
  if (!input.action || !input.entityType) {
    throw new Error("recordAudit: action and entityType are required");
  }

  await db.query(
    `insert into audit_logs
       (actor_id, actor_type, action, entity_type, entity_id,
        before, after, reasoning, source_meta, agent_run_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.actorId ?? null,
      input.actorType,
      input.action,
      input.entityType,
      input.entityId,
      input.before == null ? null : JSON.stringify(input.before),
      input.after == null ? null : JSON.stringify(input.after),
      input.reasoning ?? null,
      input.sourceMeta == null ? null : JSON.stringify(input.sourceMeta),
      input.agentRunId ?? null,
    ],
  );
}
