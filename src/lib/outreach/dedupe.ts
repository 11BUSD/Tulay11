/**
 * Outreach dedupe.
 *
 * `dedupe_hash = hash(contact_email + campaign_id + sequence_step)` — a second
 * draft with the same hash is a duplicate and is rejected. The
 * `outreach_messages.dedupe_hash` column has a partial UNIQUE index, so the DB
 * is the ultimate guard; `isDuplicate` provides a friendly pre-check.
 */
import { createHash } from "node:crypto";
import { getServiceDb, type ServiceDb } from "../db/client";

/** Compute the dedupe hash for a (contact, campaign, step) tuple. */
export function computeDedupeHash(
  contactEmail: string,
  campaignId: string,
  sequenceStep: number,
): string {
  const normalized = `${contactEmail.trim().toLowerCase()}::${campaignId}::${sequenceStep}`;
  return createHash("sha256").update(normalized).digest("hex");
}

/** True when a message with this dedupe hash already exists. */
export async function isDuplicate(
  dedupeHash: string,
  db: ServiceDb = getServiceDb(),
): Promise<boolean> {
  const rows = await db.query<{ count: string }>(
    "select count(*)::text as count from outreach_messages where dedupe_hash = $1",
    [dedupeHash],
  );
  return Number(rows[0]?.count ?? "0") > 0;
}

/** Error thrown when a duplicate draft is attempted. */
export class DuplicateDraftError extends Error {
  readonly code = "duplicate_draft" as const;
  constructor(dedupeHash: string) {
    super(`Duplicate outreach draft (dedupe_hash=${dedupeHash})`);
    this.name = "DuplicateDraftError";
  }
}
