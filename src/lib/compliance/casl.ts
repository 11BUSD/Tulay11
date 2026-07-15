/**
 * CASL outreach controls.
 *
 * Canada's Anti-Spam Legislation distinguishes EXPRESS consent (does not
 * expire until withdrawn) from IMPLIED consent (time-limited — e.g. from an
 * existing business relationship). This module answers three questions:
 *   - `isUnsubscribed(email)`  — has the recipient opted out?
 *   - `consentBasisFor(...)`   — what basis (express/implied/none) applies now,
 *                                accounting for implied-consent expiry?
 *   - `canContact(email)`      — may we lawfully contact this recipient? (not
 *                                unsubscribed AND has a live consent basis).
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit } from "../audit";
import { hashEmail } from "./hashing";
import {
  getEffectiveConsent,
  withdrawConsent,
  type ConsentSubject,
} from "./consent";
import type { ConsentPurpose } from "../validation";

/** Default implied-consent window: 24 months (CASL's transactional window). */
export const IMPLIED_CONSENT_MAX_AGE_MS = 24 * 30 * 24 * 60 * 60 * 1000;

/** The consent basis in effect right now for a subject+purpose. */
export type EffectiveBasis = "express" | "implied" | "none";

/** True if the email has any unsubscribe row for the channel (or `all`). */
export async function isUnsubscribed(
  email: string,
  channel: "email" | "sms" | "all" = "email",
  db: ServiceDb = getServiceDb(),
): Promise<boolean> {
  const emailHash = hashEmail(email);
  const rows = await db.query<{ count: string }>(
    `select count(*)::text as count from unsubscribes
       where email_hash = $1 and (channel = $2 or channel = 'all')`,
    [emailHash, channel],
  );
  return Number(rows[0]?.count ?? "0") > 0;
}

/**
 * Determine the consent basis in effect now for a (subject, purpose):
 *   - no grant / latest is a withdrawal   → 'none'
 *   - grant with basis 'express'          → 'express'
 *   - grant with basis 'implied' AND still within the implied window → 'implied'
 *   - grant with basis 'implied' but expired → 'none'
 *
 * `now` and `maxAgeMs` are injectable so expiry is deterministic in tests.
 */
export async function consentBasisFor(
  subject: ConsentSubject,
  purpose: ConsentPurpose,
  opts: { now?: Date; maxAgeMs?: number; db?: ServiceDb } = {},
): Promise<EffectiveBasis> {
  const db = opts.db ?? getServiceDb();
  const now = opts.now ?? new Date();
  const maxAgeMs = opts.maxAgeMs ?? IMPLIED_CONSENT_MAX_AGE_MS;

  const record = await getEffectiveConsent(subject, purpose, db);
  if (!record || !record.granted) return "none";

  if (record.basis === "express") return "express";

  if (record.basis === "implied") {
    const grantedAt = new Date(record.created_at).getTime();
    if (now.getTime() - grantedAt > maxAgeMs) return "none";
    return "implied";
  }

  // Unknown/absent basis on a grant — treat conservatively as express grant.
  return "express";
}

/**
 * May we lawfully contact this recipient for `purpose`? True only when the
 * recipient is NOT unsubscribed on the channel AND has a live consent basis
 * (express, or unexpired implied).
 */
export async function canContact(
  email: string,
  purpose: ConsentPurpose,
  opts: {
    channel?: "email" | "sms" | "all";
    now?: Date;
    maxAgeMs?: number;
    db?: ServiceDb;
  } = {},
): Promise<boolean> {
  const db = opts.db ?? getServiceDb();
  const channel = opts.channel ?? "email";

  if (await isUnsubscribed(email, channel, db)) return false;

  const basis = await consentBasisFor(
    { subjectEmail: email },
    purpose,
    { now: opts.now, maxAgeMs: opts.maxAgeMs, db },
  );
  return basis !== "none";
}

/** A row from `unsubscribes`. */
export interface UnsubscribeRow {
  id: string;
  email_hash: string;
  channel: string;
  created_at: string;
}

/**
 * Record an unsubscribe: append an `unsubscribes` row, append a `marketing`
 * consent withdrawal (never mutate prior consent), and audit — all in one
 * transaction. Stores only the hashed email (raw never persisted).
 */
export async function recordUnsubscribe(
  input: { email: string; channel?: "email" | "sms" | "all"; actorId?: string | null },
  db: ServiceDb = getServiceDb(),
): Promise<UnsubscribeRow> {
  const channel = input.channel ?? "all";
  const emailHash = hashEmail(input.email);

  return db.transaction(async (tx) => {
    const [row] = await tx.query<UnsubscribeRow>(
      `insert into unsubscribes (email_hash, channel) values ($1, $2) returning *`,
      [emailHash, channel],
    );
    // Append a withdrawal so effective marketing consent flips to false.
    await withdrawConsent(
      {
        subjectEmail: input.email,
        purpose: "marketing",
        consentTextVersion: "unsubscribe",
        actorId: input.actorId ?? null,
      },
      tx,
    );
    await recordAudit(
      {
        actorId: input.actorId ?? null,
        actorType: "human",
        action: "outreach.unsubscribed",
        entityType: "unsubscribes",
        entityId: row.id,
        after: { channel },
        sourceMeta: { email_hash: emailHash },
      },
      tx,
    );
    return row;
  });
}
