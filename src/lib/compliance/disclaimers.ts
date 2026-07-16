/**
 * Disclaimer configuration keyed by pillar (+ optional category).
 *
 * Regulated pillars (mortgage/FSRA, insurance, legal, immigration, tax,
 * investment, credit) render a licensing disclaimer AND set
 * `requiresLicensedReferral=true` — the UI must then only surface partners with
 * a verified license. Non-regulated but monetized surfaces (`general`) show an
 * affiliate-disclosure disclaimer instead. Copy is engineering/product
 * guardrail text, not legal advice.
 */

/** The pillars a disclaimer can be keyed on. */
export type Pillar =
  | "mortgage"
  | "insurance"
  | "legal"
  | "immigration"
  | "tax"
  | "investment"
  | "credit"
  | "general";

/** Resolved disclaimer for a pillar/category. */
export interface DisclaimerConfig {
  pillar: Pillar;
  /** Regulator name, when applicable (e.g. FSRA). */
  regulator?: string;
  /** Plain-language disclaimer body shown to the user. */
  body: string;
  /** True for regulated pillars — UI must filter to license-verified partners. */
  requiresLicensedReferral: boolean;
}

/** The set of pillars treated as regulated. */
export const REGULATED_PILLARS: readonly Pillar[] = [
  "mortgage",
  "insurance",
  "legal",
  "immigration",
  "tax",
  "investment",
  "credit",
] as const;

/** True if `pillar` is a regulated category. */
export function isRegulatedPillar(pillar: Pillar): boolean {
  return REGULATED_PILLARS.includes(pillar);
}

const CONFIG: Record<Pillar, DisclaimerConfig> = {
  mortgage: {
    pillar: "mortgage",
    regulator: "FSRA",
    body: "Tulay is not a mortgage lender or licensed mortgage brokerage. Mortgage products are offered and approved solely by the licensed provider. Rates, terms and approval are set by them and subject to their assessment. Please read their full disclosure before applying.",
    requiresLicensedReferral: true,
  },
  insurance: {
    pillar: "insurance",
    regulator: "FSRA",
    body: "Tulay is not a licensed insurance provider or brokerage. Insurance products are offered and underwritten solely by the licensed insurer. Coverage, premiums and eligibility are set by them. Please read their policy documents before purchasing.",
    requiresLicensedReferral: true,
  },
  legal: {
    pillar: "legal",
    regulator: "Law Society of Ontario",
    body: "Tulay does not provide legal advice and is not a law firm. Legal services are provided solely by licensed lawyers or paralegals. This information is general and not a substitute for advice from a licensed professional.",
    requiresLicensedReferral: true,
  },
  immigration: {
    pillar: "immigration",
    regulator: "CICC",
    body: "Tulay does not provide immigration advice and is not a licensed immigration consultant or lawyer. Immigration services are provided solely by authorized representatives (RCIC or licensed lawyers). This information is general only.",
    requiresLicensedReferral: true,
  },
  tax: {
    pillar: "tax",
    regulator: "CRA",
    body: "Tulay does not provide tax advice. Tax preparation and advice are provided solely by qualified professionals. This information is general and not a substitute for advice specific to your situation.",
    requiresLicensedReferral: true,
  },
  investment: {
    pillar: "investment",
    regulator: "OSC",
    body: "Tulay is not a registered investment dealer or adviser and does not provide investment advice. Investment products and advice are provided solely by registered firms. Please consult a registered professional before investing.",
    requiresLicensedReferral: true,
  },
  credit: {
    pillar: "credit",
    regulator: "FSRA",
    body: "Tulay is not a bank or a licensed credit provider. Credit products are offered and approved solely by the financial institution. Approval, rates and terms are set by them and subject to their assessment. Please read their full disclosure before applying.",
    requiresLicensedReferral: true,
  },
  general: {
    pillar: "general",
    body: "Tulay may earn a referral fee or commission if you sign up through some of the links on this page, at no additional cost to you. This helps keep Tulay free. We only feature partners we believe are useful to newcomers.",
    requiresLicensedReferral: false,
  },
};

/**
 * Resolve the disclaimer config for a pillar. `category` is accepted for
 * future per-category overrides; currently the pillar determines the copy. An
 * unknown pillar falls back to the `general` affiliate-disclosure config.
 */
export function getDisclaimer(
  pillar: Pillar,
  category?: string,
): DisclaimerConfig {
  // `category` is reserved for future per-category overrides; the pillar drives
  // the copy today. Reference it so the documented arg stays in the signature.
  void category;
  return CONFIG[pillar] ?? CONFIG.general;
}
