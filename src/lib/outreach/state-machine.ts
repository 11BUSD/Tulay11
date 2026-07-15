/**
 * OutreachMessage state machine — the 10-state guarded transition table.
 *
 * Every transition is guarded: an attempt to move to a state not reachable from
 * the current state throws. Every applied transition writes an `audit_logs` row
 * (via `recordAudit`) in the same transaction as the state update. `approve` /
 * `reject` are the only HUMAN-driven transitions.
 *
 * The 10 states (mirrors the `outreach_message_state` enum):
 *   not_started, drafted, approved, sent, follow_up_due, replied,
 *   meeting_booked, rejected, agreement_pending, active_partner
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit, type ActorType } from "../audit";

/** The 10 outreach states. */
export type OutreachState =
  | "not_started"
  | "drafted"
  | "approved"
  | "sent"
  | "follow_up_due"
  | "replied"
  | "meeting_booked"
  | "rejected"
  | "agreement_pending"
  | "active_partner";

/** All valid states (for validation/tests). */
export const OUTREACH_STATES: OutreachState[] = [
  "not_started",
  "drafted",
  "approved",
  "sent",
  "follow_up_due",
  "replied",
  "meeting_booked",
  "rejected",
  "agreement_pending",
  "active_partner",
];

/**
 * Allowed transitions. A state maps to the set of states it may move to.
 * `rejected` and `active_partner` are terminal (no outgoing edges).
 */
export const TRANSITIONS: Record<OutreachState, OutreachState[]> = {
  not_started: ["drafted"],
  drafted: ["approved", "rejected"],
  approved: ["sent"],
  sent: ["follow_up_due", "replied"],
  follow_up_due: ["drafted", "replied"],
  replied: ["meeting_booked", "rejected"],
  meeting_booked: ["agreement_pending"],
  agreement_pending: ["active_partner"],
  rejected: [],
  active_partner: [],
};

/** True when `from → to` is a legal transition. */
export function canTransition(from: OutreachState, to: OutreachState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Error thrown on an illegal transition. */
export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition" as const;
  readonly from: OutreachState;
  readonly to: OutreachState;
  constructor(from: OutreachState, to: OutreachState) {
    super(`Illegal outreach transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Options for applying a transition. */
export interface TransitionOptions {
  actorId?: string | null;
  actorType?: ActorType;
  /** Required when `actorType==='agent'`. */
  reasoning?: string | null;
  /** Extra columns to set alongside `state` (e.g. approved_by, sent_at). */
  columns?: Record<string, unknown>;
  db?: ServiceDb;
}

/** A minimal outreach_messages row shape. */
export interface OutreachMessageRow {
  id: string;
  state: OutreachState;
  contact_id: string | null;
  campaign_id: string | null;
  [key: string]: unknown;
}

/**
 * Apply a guarded transition to `messageId`. Reads the current state, validates
 * the transition, updates `state` (+ any extra columns) and writes an audit
 * row — all in ONE transaction. Throws `InvalidTransitionError` for an illegal
 * move.
 */
export async function transitionMessage(
  messageId: string,
  to: OutreachState,
  opts: TransitionOptions = {},
): Promise<OutreachMessageRow> {
  const db = opts.db ?? getServiceDb();
  const actorType = opts.actorType ?? "system";

  return db.transaction(async (tx) => {
    const [current] = await tx.query<OutreachMessageRow>(
      "select * from outreach_messages where id = $1 for update",
      [messageId],
    );
    if (!current) {
      throw new Error(`outreach_messages ${messageId} not found`);
    }
    if (!canTransition(current.state, to)) {
      throw new InvalidTransitionError(current.state, to);
    }

    // Build the SET clause: state plus any extra columns.
    const extra = opts.columns ?? {};
    const cols = ["state", ...Object.keys(extra)];
    const params: unknown[] = [messageId, to, ...Object.values(extra)];
    const setClauses = cols.map((c, i) => `${c}=$${i + 2}`);
    setClauses.push("updated_at=now()");

    const [updated] = await tx.query<OutreachMessageRow>(
      `update outreach_messages set ${setClauses.join(", ")} where id=$1 returning *`,
      params,
    );

    await recordAudit(
      {
        actorId: opts.actorId ?? null,
        actorType,
        action: `outreach.state.${to}`,
        entityType: "outreach_messages",
        entityId: messageId,
        before: { state: current.state },
        after: { state: to },
        reasoning: opts.reasoning ?? null,
      },
      tx,
    );

    return updated;
  });
}
