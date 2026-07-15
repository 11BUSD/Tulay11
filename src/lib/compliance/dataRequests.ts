/**
 * Data subject requests (PIPEDA export / delete).
 *
 * State machine: `received → verifying → processing → completed | rejected`.
 * A request may only be EXECUTED (export bundled / delete performed) once it is
 * both email-confirmed and (for deletes) re-authenticated — modeled by the
 * `emailConfirmed` / `reauthenticated` flags advancing it through `verifying`.
 *
 * Delete semantics: source PII (the `users` row) is ANONYMIZED in place, while
 * append-only audit/consent rows are RETAINED for regulatory purposes. Any
 * consent rows keyed by `subject_id` are additionally re-keyed by appending a
 * `subject_email_hash` linkage so they remain matchable after the account id is
 * scrubbed, without mutating the original append-only rows.
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit } from "../audit";
import { hashEmail } from "./hashing";
import type { DataRequestKind } from "../validation";

/** Data-request lifecycle statuses. */
export type DataRequestStatus =
  | "received"
  | "verifying"
  | "processing"
  | "completed"
  | "rejected";

/** A row from `data_requests`. */
export interface DataRequest {
  id: string;
  subject_id: string | null;
  subject_email_hash: string | null;
  kind: DataRequestKind;
  status: DataRequestStatus;
  export_artifact_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreateDataRequestInput {
  subjectId?: string | null;
  /** Raw email; hashed into `subject_email_hash` (raw never stored). */
  subjectEmail?: string | null;
  kind: DataRequestKind;
  actorId?: string | null;
}

/** Create a data request in `received` state and audit it. */
export async function createDataRequest(
  input: CreateDataRequestInput,
  db: ServiceDb = getServiceDb(),
): Promise<DataRequest> {
  if (input.subjectId == null && input.subjectEmail == null) {
    throw new Error("createDataRequest requires subjectId or subjectEmail");
  }
  const emailHash = input.subjectEmail ? hashEmail(input.subjectEmail) : null;

  return db.transaction(async (tx) => {
    const [row] = await tx.query<DataRequest>(
      `insert into data_requests (subject_id, subject_email_hash, kind, status)
       values ($1, $2, $3, 'received')
       returning *`,
      [input.subjectId ?? null, emailHash, input.kind],
    );
    await recordAudit(
      {
        actorId: input.actorId ?? input.subjectId ?? null,
        actorType: "human",
        action: "data_request.created",
        entityType: "data_requests",
        entityId: row.id,
        after: { kind: row.kind, status: row.status },
      },
      tx,
    );
    return row;
  });
}

async function setStatus(
  tx: ServiceDb,
  id: string,
  status: DataRequestStatus,
  extra: { exportArtifactUrl?: string | null; completed?: boolean } = {},
): Promise<DataRequest> {
  const [row] = await tx.query<DataRequest>(
    `update data_requests
       set status = $2,
           export_artifact_url = coalesce($3, export_artifact_url),
           completed_at = case when $4 then now() else completed_at end
     where id = $1
     returning *`,
    [id, status, extra.exportArtifactUrl ?? null, extra.completed ?? false],
  );
  await recordAudit(
    {
      actorType: "system",
      action: "data_request.status_changed",
      entityType: "data_requests",
      entityId: id,
      after: { status },
    },
    tx,
  );
  return row;
}

async function loadRequest(
  db: ServiceDb,
  id: string,
): Promise<DataRequest> {
  const [row] = await db.query<DataRequest>(
    "select * from data_requests where id = $1",
    [id],
  );
  if (!row) throw new Error(`data_request ${id} not found`);
  return row;
}

/** Guard: request may only be executed when verified (and re-auth'd for delete). */
export interface VerificationFlags {
  emailConfirmed: boolean;
  reauthenticated?: boolean;
}

export class DataRequestNotVerifiedError extends Error {
  readonly code = "not_verified" as const;
  constructor(message: string) {
    super(message);
    this.name = "DataRequestNotVerifiedError";
  }
}

/**
 * The exported bundle for a subject: their source rows plus consent history.
 */
export interface ExportBundle {
  subjectId: string | null;
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  consentHistory: Record<string, unknown>[];
  referralClicks: Record<string, unknown>[];
  referralConversions: Record<string, unknown>[];
  generatedAt: string;
}

/**
 * Process an export: verify (email-confirm required), bundle the subject's rows
 * + consent history, mark completed. Returns the bundle.
 */
export async function processExport(
  requestId: string,
  flags: VerificationFlags,
  db: ServiceDb = getServiceDb(),
): Promise<{ request: DataRequest; bundle: ExportBundle }> {
  if (!flags.emailConfirmed) {
    throw new DataRequestNotVerifiedError(
      "Export requires email confirmation before processing",
    );
  }
  const request = await loadRequest(db, requestId);
  if (request.kind !== "export") {
    throw new Error("processExport called on a non-export request");
  }

  return db.transaction(async (tx) => {
    await setStatus(tx, requestId, "verifying");
    await setStatus(tx, requestId, "processing");

    const user = request.subject_id
      ? (
          await tx.query<Record<string, unknown>>(
            "select * from users where id = $1",
            [request.subject_id],
          )
        )[0] ?? null
      : null;

    // profiles shares the subject id with users and holds self-serve PII, so
    // it belongs in the export too.
    const profile = request.subject_id
      ? (
          await tx.query<Record<string, unknown>>(
            "select * from profiles where id = $1",
            [request.subject_id],
          )
        )[0] ?? null
      : null;

    const consentHistory = await tx.query<Record<string, unknown>>(
      `select * from consent_records
         where ($1::uuid is not null and subject_id = $1)
            or ($2::text is not null and subject_email_hash = $2)
         order by created_at asc`,
      [request.subject_id, request.subject_email_hash],
    );

    const referralClicks = request.subject_id
      ? await tx.query<Record<string, unknown>>(
          "select * from referral_clicks where user_id = $1 order by created_at asc",
          [request.subject_id],
        )
      : [];

    const referralConversions = request.subject_id
      ? await tx.query<Record<string, unknown>>(
          "select * from referral_conversions where user_id = $1 order by created_at asc",
          [request.subject_id],
        )
      : [];

    const bundle: ExportBundle = {
      subjectId: request.subject_id,
      user,
      profile,
      consentHistory,
      referralClicks,
      referralConversions,
      generatedAt: new Date().toISOString(),
    };

    const completed = await setStatus(tx, requestId, "completed", {
      completed: true,
    });
    return { request: completed, bundle };
  });
}

/**
 * Process a delete: verify (email-confirm + re-auth required), anonymize the
 * source `users` PII in place, and RETAIN append-only audit/consent rows —
 * re-keyed by appending a `subject_email_hash` linkage row so they remain
 * matchable after the account id is scrubbed. Returns the updated request.
 */
export async function processDelete(
  requestId: string,
  flags: VerificationFlags,
  db: ServiceDb = getServiceDb(),
): Promise<DataRequest> {
  if (!flags.emailConfirmed) {
    throw new DataRequestNotVerifiedError(
      "Delete requires email confirmation before processing",
    );
  }
  if (!flags.reauthenticated) {
    throw new DataRequestNotVerifiedError(
      "Delete requires re-authentication before processing",
    );
  }
  const request = await loadRequest(db, requestId);
  if (request.kind !== "delete") {
    throw new Error("processDelete called on a non-delete request");
  }

  return db.transaction(async (tx) => {
    await setStatus(tx, requestId, "verifying");
    await setStatus(tx, requestId, "processing");

    let retainedHash = request.subject_email_hash;

    if (request.subject_id) {
      // Preserve a matchable hash from the current email before scrubbing it.
      const [existing] = await tx.query<{ email: string | null }>(
        "select email from users where id = $1",
        [request.subject_id],
      );
      if (existing?.email) {
        retainedHash = hashEmail(existing.email);
      }

      // Anonymize source PII in place (neither users nor profiles has an
      // append-only guard). profiles shares the subject id with users and the
      // self-serve profile UI writes PII (display_name, city) there, so BOTH
      // rows must be scrubbed or a delete keyed by that id leaves PII behind.
      const anonId = `deleted-${request.subject_id}`;
      await tx.query(
        `update users
           set email = $2, display_name = null, city = null, anonymous_id = $3
         where id = $1`,
        [request.subject_id, `${anonId}@deleted.invalid`, anonId],
      );
      await tx.query(
        `update profiles
           set display_name = null, city = null
         where id = $1`,
        [request.subject_id],
      );

      // Re-key consent: append (never mutate) a linkage withdrawal row carrying
      // the retained email hash so consent history stays matchable post-delete.
      if (retainedHash) {
        await tx.query(
          `insert into consent_records
             (subject_id, subject_email_hash, purpose, data_categories,
              shared_with, consequences_text, consent_text_version, basis,
              granted)
           values ($1, $2, 'account', '{}', 'none',
                   'Account deleted per data-subject request; PII anonymized, audit/consent retained.',
                   'data-request', 'express', false)`,
          [request.subject_id, retainedHash],
        );
      }
    }

    await recordAudit(
      {
        actorType: "system",
        action: "data_request.deleted",
        entityType: "users",
        entityId: request.subject_id ?? request.id,
        after: { anonymized: true, retained_email_hash: retainedHash },
      },
      tx,
    );

    return setStatus(tx, requestId, "completed", { completed: true });
  });
}

/** Reject a request (e.g. verification failed). */
export async function rejectDataRequest(
  requestId: string,
  reason: string,
  db: ServiceDb = getServiceDb(),
): Promise<DataRequest> {
  return db.transaction(async (tx) => {
    const row = await setStatus(tx, requestId, "rejected");
    await recordAudit(
      {
        actorType: "system",
        action: "data_request.rejected",
        entityType: "data_requests",
        entityId: requestId,
        after: { reason },
      },
      tx,
    );
    return row;
  });
}
