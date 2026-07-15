/**
 * Outreach approval gate — the ONLY lawful path to sending outbound messages.
 *
 * No automated agent may send outreach without a HUMAN approval. This is
 * enforced in code (not policy):
 *   - `queueOutreach()`  — an agent/system enqueues a draft; status `pending`.
 *   - `approveOutreach()` — a HUMAN approver approves it; records approver + ts.
 *   - `assertApprovedBeforeSend()` — the only function transport code may call
 *     before sending; it throws unless the draft is human-approved, the
 *     recipient is not unsubscribed, and the send is within throttle limits.
 *
 * `outreach_approvals` is an append-only ledger: each transition is a NEW row
 * for the same `draft_id`, and the CURRENT status is the latest row. Every
 * transition writes an `audit_logs` row via `recordAudit` in the same
 * transaction.
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit } from "../audit";
import { isUnsubscribed } from "./casl";

/** Approval lifecycle statuses. */
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "expired";

/** A row from `outreach_approvals`. */
export interface ApprovalRow {
  id: string;
  draft_id: string;
  channel: string | null;
  recipient_type: string | null;
  recipient_ref: string | null;
  body_preview: string | null;
  status: ApprovalStatus;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/** Minimum gap between two sends to the same recipient (throttle). */
export const DEFAULT_THROTTLE_MS = 60 * 1000;

/** Input to enqueue an outreach draft for approval. */
export interface QueueOutreachInput {
  draftId: string;
  channel: "email" | "sms" | "partner_portal";
  recipientType: "user" | "counterparty";
  /** Hashed recipient ref / id (never a raw email). */
  recipientRef: string;
  bodyPreview?: string | null;
  /** Agent/system actor that requested the outreach. */
  requestedBy?: string | null;
  /** Reasoning — required when the requester is an agent. */
  reasoning?: string | null;
  requesterType?: "agent" | "system";
}

/** Return the latest (current) approval row for a draft, or null. */
export async function getLatestApproval(
  draftId: string,
  db: ServiceDb = getServiceDb(),
): Promise<ApprovalRow | null> {
  const rows = await db.query<ApprovalRow>(
    `select * from outreach_approvals
       where draft_id = $1
       order by created_at desc, id desc
       limit 1`,
    [draftId],
  );
  return rows[0] ?? null;
}

/** Insert an approval-ledger row + audit, in one transaction. */
async function appendApproval(
  db: ServiceDb,
  row: {
    draftId: string;
    channel: string | null;
    recipientType: string | null;
    recipientRef: string | null;
    bodyPreview: string | null;
    status: ApprovalStatus;
    requestedBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  },
  audit: {
    actorId: string | null;
    actorType: "human" | "agent" | "system";
    action: string;
    reasoning?: string | null;
  },
): Promise<ApprovalRow> {
  return db.transaction(async (tx) => {
    const [inserted] = await tx.query<ApprovalRow>(
      `insert into outreach_approvals
         (draft_id, channel, recipient_type, recipient_ref, body_preview,
          status, requested_by, approved_by, approved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning *`,
      [
        row.draftId,
        row.channel,
        row.recipientType,
        row.recipientRef,
        row.bodyPreview,
        row.status,
        row.requestedBy,
        row.approvedBy,
        row.approvedAt,
      ],
    );
    await recordAudit(
      {
        actorId: audit.actorId,
        actorType: audit.actorType,
        action: audit.action,
        entityType: "outreach_approvals",
        entityId: row.draftId,
        after: { status: row.status, approval_id: inserted.id },
        reasoning: audit.reasoning ?? null,
      },
      tx,
    );
    return inserted;
  });
}

/**
 * Enqueue an outreach draft for human approval (status `pending`). If the
 * requester is an agent, `reasoning` is required (enforced by `recordAudit`).
 */
export async function queueOutreach(
  input: QueueOutreachInput,
  db: ServiceDb = getServiceDb(),
): Promise<ApprovalRow> {
  const requesterType = input.requesterType ?? "agent";
  return appendApproval(
    db,
    {
      draftId: input.draftId,
      channel: input.channel,
      recipientType: input.recipientType,
      recipientRef: input.recipientRef,
      bodyPreview: input.bodyPreview ?? null,
      status: "pending",
      requestedBy: input.requestedBy ?? null,
      approvedBy: null,
      approvedAt: null,
    },
    {
      actorId: input.requestedBy ?? null,
      actorType: requesterType,
      action: "outreach.queued",
      reasoning: input.reasoning ?? null,
    },
  );
}

/** Error thrown by approval transitions / send gate. */
export class ApprovalError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApprovalError";
    this.code = code;
  }
}

/** Input to approve a queued draft. Approver MUST be a human. */
export interface ApproveOutreachInput {
  draftId: string;
  /** The human approver's actor id (required). */
  approvedBy: string;
  /** Approve or reject. */
  decision?: "approved" | "rejected";
}

/**
 * Human approval (or rejection) of a queued draft. Requires a `pending` current
 * status and a non-empty human approver id. Appends an `approved`/`rejected`
 * ledger row with `approved_by` + `approved_at`, audited as a human action.
 */
export async function approveOutreach(
  input: ApproveOutreachInput,
  db: ServiceDb = getServiceDb(),
): Promise<ApprovalRow> {
  if (!input.approvedBy || input.approvedBy.trim() === "") {
    throw new ApprovalError(
      "human_required",
      "approveOutreach requires a human approver id",
    );
  }
  const decision = input.decision ?? "approved";

  const current = await getLatestApproval(input.draftId, db);
  if (!current) {
    throw new ApprovalError("not_found", "No queued draft to approve");
  }
  if (current.status !== "pending") {
    throw new ApprovalError(
      "invalid_transition",
      `Cannot ${decision} a draft in status '${current.status}'`,
    );
  }

  return appendApproval(
    db,
    {
      draftId: current.draft_id,
      channel: current.channel,
      recipientType: current.recipient_type,
      recipientRef: current.recipient_ref,
      bodyPreview: current.body_preview,
      status: decision,
      requestedBy: current.requested_by,
      approvedBy: input.approvedBy,
      approvedAt: new Date().toISOString(),
    },
    {
      actorId: input.approvedBy,
      actorType: "human",
      action: `outreach.${decision}`,
    },
  );
}

/** Options for the send gate. */
export interface SendGateOptions {
  /** Raw recipient email to check unsubscribe against (optional). */
  recipientEmail?: string | null;
  /** Throttle window in ms (min gap between sends to the same recipient). */
  throttleMs?: number;
  now?: Date;
  db?: ServiceDb;
}

/**
 * The ONLY function transport code may call before sending. Throws unless:
 *   - the draft's current status is `approved`,
 *   - it was approved by a human (`approved_by` set),
 *   - the recipient is not unsubscribed (when an email is supplied),
 *   - the last send to this draft was outside the throttle window.
 *
 * Returns the approved row on success; the transport should then append a
 * `sent` row via `markSent`.
 */
export async function assertApprovedBeforeSend(
  draftId: string,
  opts: SendGateOptions = {},
): Promise<ApprovalRow> {
  const db = opts.db ?? getServiceDb();
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const now = opts.now ?? new Date();

  const current = await getLatestApproval(draftId, db);
  if (!current) {
    throw new ApprovalError("not_found", "No approval record for draft");
  }
  if (current.status !== "approved") {
    throw new ApprovalError(
      "not_approved",
      `Draft is '${current.status}', not approved`,
    );
  }
  if (!current.approved_by) {
    throw new ApprovalError(
      "human_required",
      "Draft lacks a human approver",
    );
  }

  if (opts.recipientEmail) {
    const channel =
      current.channel === "sms" ? "sms" : current.channel === "email" ? "email" : "all";
    if (await isUnsubscribed(opts.recipientEmail, channel, db)) {
      throw new ApprovalError(
        "unsubscribed",
        "Recipient has unsubscribed",
      );
    }
  }

  // Throttle: reject if a send to this SAME RECIPIENT (any draft) happened
  // within the window. Keyed on recipient_ref so we don't spam one contact
  // across multiple drafts.
  if (current.recipient_ref) {
    const sentRows = await db.query<{ created_at: string }>(
      `select created_at from outreach_approvals
         where recipient_ref = $1 and status = 'sent'
         order by created_at desc limit 1`,
      [current.recipient_ref],
    );
    if (sentRows[0]) {
      const lastSent = new Date(sentRows[0].created_at).getTime();
      if (now.getTime() - lastSent < throttleMs) {
        throw new ApprovalError("throttled", "Send throttled");
      }
    }
  }

  return current;
}

/**
 * Append a `sent` ledger row after a successful transport send. Must only be
 * called after `assertApprovedBeforeSend` passes.
 */
export async function markSent(
  draftId: string,
  actorId: string | null,
  db: ServiceDb = getServiceDb(),
): Promise<ApprovalRow> {
  const current = await getLatestApproval(draftId, db);
  if (!current || current.status !== "approved") {
    throw new ApprovalError(
      "not_approved",
      "Cannot mark sent: draft is not approved",
    );
  }
  return appendApproval(
    db,
    {
      draftId: current.draft_id,
      channel: current.channel,
      recipientType: current.recipient_type,
      recipientRef: current.recipient_ref,
      bodyPreview: current.body_preview,
      status: "sent",
      requestedBy: current.requested_by,
      approvedBy: current.approved_by,
      approvedAt: current.approved_at,
    },
    {
      actorId,
      actorType: "system",
      action: "outreach.sent",
    },
  );
}
