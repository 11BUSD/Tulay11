/**
 * Consent-payload builder for lead forms.
 *
 * A lead form collects PII (name, email, ...) and shares it with a NAMED
 * partner. PIPEDA/CASL require the user to see exactly what is collected, why,
 * with whom it is shared, and the consequences — captured as an explicit
 * express consent. This module builds the full ConsentRecord payload the
 * `POST /api/leads` route persists, so the UI and the server agree on shape.
 *
 * The consent text VERSION is bumped whenever the wording below changes, so the
 * ledger records which wording the user agreed to.
 */

/** Current lead-consent wording version. Bump on any copy change. */
export const LEAD_CONSENT_VERSION = "lead-referral-v1";

/** The default data categories a lead form shares with a partner. */
export const LEAD_DATA_CATEGORIES = [
  "name",
  "email",
  "phone",
  "city",
] as const;

/** The consent payload embedded in a lead submission. */
export interface LeadConsentPayload {
  purpose: "lead_referral";
  dataCategories: string[];
  sharedWith: string;
  consequencesText: string;
  consentTextVersion: string;
  basis: "express";
  granted: boolean;
}

export interface BuildLeadConsentArgs {
  /** The named partner the data is shared with (required for disclosure). */
  partnerName: string;
  /** Whether the user checked the explicit consent box. */
  granted: boolean;
  /** Override the default shared data categories. */
  dataCategories?: string[];
}

/**
 * Human-readable consequences text naming the partner and the data shared.
 * This is what the user is agreeing to and what is persisted for the record.
 */
export function leadConsequencesText(
  partnerName: string,
  dataCategories: readonly string[] = LEAD_DATA_CATEGORIES,
): string {
  const cats = dataCategories.join(", ");
  return (
    `I consent to Tulay sharing my ${cats} with ${partnerName} so they can ` +
    `contact me about this offer. I understand Tulay may receive a referral ` +
    `fee, this is my choice, and I can withdraw consent at any time.`
  );
}

/**
 * Build the full consent payload for a lead submission. `granted` reflects the
 * explicit checkbox — the server rejects the lead when it is not true.
 */
export function buildLeadConsent({
  partnerName,
  granted,
  dataCategories = [...LEAD_DATA_CATEGORIES],
}: BuildLeadConsentArgs): LeadConsentPayload {
  return {
    purpose: "lead_referral",
    dataCategories,
    sharedWith: partnerName,
    consequencesText: leadConsequencesText(partnerName, dataCategories),
    consentTextVersion: LEAD_CONSENT_VERSION,
    basis: "express",
    granted,
  };
}
