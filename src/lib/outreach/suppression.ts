/**
 * Outreach suppression.
 *
 * A contact is suppressed from drafting/sequencing/sending when its
 * `consent_status` is `opted_out` or `bounced`, or when the contact's email is
 * on the unsubscribe ledger. Suppressed contacts must never receive drafts or
 * sends.
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { isUnsubscribed } from "../compliance/casl";

/** A contact's suppression-relevant fields. */
export interface SuppressionCheck {
  suppressed: boolean;
  reason?: "opted_out" | "bounced" | "unsubscribed" | "not_found";
}

/** Consent statuses that suppress a contact outright. */
const SUPPRESSED_STATUSES = new Set(["opted_out", "bounced"]);

/**
 * Determine whether a contact is suppressed. Checks `consent_status` first,
 * then the unsubscribe ledger (by the contact's email).
 */
export async function isContactSuppressed(
  contactId: string,
  opts: { db?: ServiceDb } = {},
): Promise<SuppressionCheck> {
  const db = opts.db ?? getServiceDb();
  const [contact] = await db.query<{
    consent_status: string | null;
    email: string | null;
  }>(
    "select consent_status, email from outreach_contacts where id = $1",
    [contactId],
  );
  if (!contact) return { suppressed: true, reason: "not_found" };

  if (contact.consent_status && SUPPRESSED_STATUSES.has(contact.consent_status)) {
    return {
      suppressed: true,
      reason: contact.consent_status as "opted_out" | "bounced",
    };
  }

  if (contact.email && (await isUnsubscribed(contact.email, "all", db))) {
    return { suppressed: true, reason: "unsubscribed" };
  }

  return { suppressed: false };
}

/** Filter a list of contact ids down to the non-suppressed ones. */
export async function filterSuppressed(
  contactIds: string[],
  opts: { db?: ServiceDb } = {},
): Promise<string[]> {
  const kept: string[] = [];
  for (const id of contactIds) {
    const check = await isContactSuppressed(id, opts);
    if (!check.suppressed) kept.push(id);
  }
  return kept;
}
