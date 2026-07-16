/**
 * Consent ledger — append-only.
 *
 * `consent_records` is never mutated: a withdrawal is a NEW row with
 * `granted=false`. Effective consent for a (subject, purpose) is the latest row
 * by `created_at`. `requireConsent` guards downstream PII reads/writes and
 * throws a 403-style error when there is no effective grant. IP addresses are
 * stored hashed via the hashing layer; a raw email is hashed into
 * `subject_email_hash` for pre-account leads (raw email never persisted here).
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit } from "../audit";
import { hashEmail, hashIp } from "./hashing";
import type { ConsentBasis, ConsentPurpose } from "../validation";

/** Identifies the consent subject — an account id and/or an email. */
export interface ConsentSubject {
  subjectId?: string | null;
  /** Raw email for pre-account leads; hashed before storage. */
  subjectEmail?: string | null;
}

/** A row from `consent_records`. */
export interface ConsentRecord {
  id: string;
  subject_id: string | null;
  subject_email_hash: string | null;
  purpose: string;
  data_categories: string[];
  shared_with: string | null;
  consequences_text: string | null;
  consent_text_version: string | null;
  basis: string | null;
  granted: boolean;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Input to record a consent grant or withdrawal. */
export interface RecordConsentInput extends ConsentSubject {
  purpose: ConsentPurpose;
  dataCategories?: string[];
  sharedWith?: string | null;
  consequencesText?: string | null;
  consentTextVersion: string;
  basis?: ConsentBasis;
  granted?: boolean;
  /** Raw IP; hashed before storage (never stored raw). */
  ip?: string | null;
  userAgent?: string | null;
  /** Actor recording the consent (defaults to the subject / system). */
  actorId?: string | null;
}

function resolveEmailHash(subject: ConsentSubject): string | null {
  return subject.subjectEmail ? hashEmail(subject.subjectEmail) : null;
}

/**
 * Insert a consent row (grant or withdrawal) and write an audit row in the same
 * transaction. Returns the created record.
 */
export async function recordConsent(
  input: RecordConsentInput,
  db: ServiceDb = getServiceDb(),
): Promise<ConsentRecord> {
  if (input.subjectId == null && input.subjectEmail == null) {
    throw new Error("recordConsent requires subjectId or subjectEmail");
  }
  const emailHash = resolveEmailHash(input);
  const ipHash = input.ip ? hashIp(input.ip) : null;
  const granted = input.granted ?? true;

  return db.transaction(async (tx) => {
    const [row] = await tx.query<ConsentRecord>(
      `insert into consent_records
         (subject_id, subject_email_hash, purpose, data_categories, shared_with,
          consequences_text, consent_text_version, basis, granted, ip_hash,
          user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        input.subjectId ?? null,
        emailHash,
        input.purpose,
        input.dataCategories ?? [],
        input.sharedWith ?? null,
        input.consequencesText ?? null,
        input.consentTextVersion,
        input.basis ?? "express",
        granted,
        ipHash,
        input.userAgent ?? null,
      ],
    );
    await recordAudit(
      {
        actorId: input.actorId ?? input.subjectId ?? null,
        actorType: "human",
        action: granted ? "consent.granted" : "consent.withdrawn",
        entityType: "consent_records",
        entityId: row.id,
        after: {
          purpose: row.purpose,
          granted: row.granted,
          basis: row.basis,
          consent_text_version: row.consent_text_version,
        },
        sourceMeta: ipHash ? { ip_hash: ipHash } : null,
      },
      tx,
    );
    return row;
  });
}

/**
 * Withdraw consent: appends a NEW `granted=false` row (never mutates a prior
 * one). Copies the purpose/subject from the withdrawal input.
 */
export function withdrawConsent(
  input: Omit<RecordConsentInput, "granted">,
  db: ServiceDb = getServiceDb(),
): Promise<ConsentRecord> {
  return recordConsent({ ...input, granted: false }, db);
}

/**
 * Return the latest consent row for a (subject, purpose), or `null` if none.
 * Matches on `subject_id` when provided, otherwise on `subject_email_hash`.
 */
export async function getEffectiveConsent(
  subject: ConsentSubject,
  purpose: ConsentPurpose,
  db: ServiceDb = getServiceDb(),
): Promise<ConsentRecord | null> {
  if (subject.subjectId == null && subject.subjectEmail == null) {
    throw new Error("getEffectiveConsent requires subjectId or subjectEmail");
  }
  const emailHash = resolveEmailHash(subject);
  const rows = await db.query<ConsentRecord>(
    `select * from consent_records
       where purpose = $1
         and ( ($2::uuid is not null and subject_id = $2)
            or ($3::text is not null and subject_email_hash = $3) )
       order by created_at desc, id desc
       limit 1`,
    [purpose, subject.subjectId ?? null, emailHash],
  );
  return rows[0] ?? null;
}

/** Error thrown by `requireConsent` when there is no effective grant (403). */
export class ConsentRequiredError extends Error {
  readonly status = 403 as const;
  readonly code = "consent_required" as const;
  readonly purpose: ConsentPurpose;

  constructor(purpose: ConsentPurpose) {
    super(`No effective consent for purpose '${purpose}'`);
    this.name = "ConsentRequiredError";
    this.purpose = purpose;
  }
}

/**
 * Guard downstream PII use: throws `ConsentRequiredError` (403) unless the
 * subject's latest consent for `purpose` is a grant (`granted=true`). Returns
 * the effective record on success.
 */
export async function requireConsent(
  purpose: ConsentPurpose,
  subject: ConsentSubject,
  db: ServiceDb = getServiceDb(),
): Promise<ConsentRecord> {
  const effective = await getEffectiveConsent(subject, purpose, db);
  if (!effective || !effective.granted) {
    throw new ConsentRequiredError(purpose);
  }
  return effective;
}
