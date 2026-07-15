/**
 * Content guardrails for agent/marketing copy.
 *
 * `assertNoForbiddenClaims(text)` scans generated or marketing copy for claims
 * we must never publish: fabricated regulatory status/approvals, invented
 * partner deals, testimonials, or regulated-advice phrasing. If any are found
 * it THROWS (blocking publication) and the findings are attached to the error
 * so callers can log/surface them. `scanForForbiddenClaims` returns the same
 * findings without throwing, for callers that want to inspect first.
 */

/** A single guardrail finding. */
export interface ForbiddenClaimFinding {
  /** Category of the violation. */
  category:
    | "regulatory_status"
    | "government_approval"
    | "testimonial"
    | "partner_deal"
    | "regulated_advice"
    | "guarantee";
  /** Human-readable description of what was matched. */
  message: string;
  /** The substring that triggered the finding. */
  match: string;
}

interface Rule {
  category: ForbiddenClaimFinding["category"];
  pattern: RegExp;
  message: string;
}

/**
 * Forbidden-claim rules. Patterns are intentionally broad + case-insensitive so
 * paraphrases are caught; false positives are acceptable here because the cost
 * of publishing a fabricated regulatory/advice claim is high.
 */
const RULES: Rule[] = [
  {
    category: "regulatory_status",
    pattern:
      /\b(we are|tulay is)\b[^.]*\b(licensed|regulated|registered|accredited|authorized)\b/i,
    message: "Claims that Tulay itself is licensed/regulated/registered.",
  },
  {
    category: "regulatory_status",
    pattern: /\b(fsra|osc|cra|cicc|rcic)[- ]?(licensed|registered|approved|certified)\b/i,
    message: "Claims a specific regulator license/registration/approval.",
  },
  {
    category: "government_approval",
    pattern:
      /\b(government|cra|ircc|province of ontario|canada)[- ]?(approved|endorsed|partnered|certified|backed)\b/i,
    message: "Claims government approval/endorsement/partnership.",
  },
  {
    category: "government_approval",
    pattern: /\b(officially|government)[- ]?(approved|endorsed|sanctioned)\b/i,
    message: "Claims official/government approval.",
  },
  {
    category: "testimonial",
    pattern: /\b(\d+(\.\d+)?\s*(stars?|\/\s*5)|rated\s+\d)\b/i,
    message: "Fabricated rating/testimonial figure.",
  },
  {
    category: "testimonial",
    pattern: /"[^"]{10,}"\s*[-—]\s*[A-Z][a-z]+/,
    message: "Fabricated quoted testimonial with an attributed name.",
  },
  {
    category: "partner_deal",
    pattern:
      /\b(exclusive|guaranteed|special)\b[^.]*\b(deal|discount|rate|offer)\b[^.]*\b(only (on|through|with) tulay|nowhere else)\b/i,
    message: "Claims an exclusive/guaranteed partner deal.",
  },
  {
    category: "guarantee",
    pattern:
      /\b(guarantee[ds]?|guaranteed)\b[^.]*\b(approval|approved|acceptance|returns?|savings?)\b/i,
    message: "Guarantees approval/returns/savings.",
  },
  {
    category: "regulated_advice",
    pattern:
      /\byou should\b[^.]*\b(invest in|refinance|buy this policy|claim this deduction|file as)\b/i,
    message: "Gives regulated (investment/mortgage/insurance/tax) advice.",
  },
  {
    category: "regulated_advice",
    pattern: /\b(this is|we recommend)\b[^.]*\b(the best (mortgage|insurance|investment|tax) (option|choice) for you)\b/i,
    message: "Presents a personalized regulated recommendation as advice.",
  },
];

/** Scan text and return all forbidden-claim findings (does not throw). */
export function scanForForbiddenClaims(text: string): ForbiddenClaimFinding[] {
  if (typeof text !== "string" || text.trim() === "") return [];
  const findings: ForbiddenClaimFinding[] = [];
  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (m) {
      findings.push({
        category: rule.category,
        message: rule.message,
        match: m[0],
      });
    }
  }
  return findings;
}

/** Error thrown when forbidden claims are found; carries the findings. */
export class ForbiddenClaimError extends Error {
  readonly code = "forbidden_claim" as const;
  readonly findings: ForbiddenClaimFinding[];

  constructor(findings: ForbiddenClaimFinding[]) {
    super(
      `Blocked ${findings.length} forbidden claim(s): ${findings
        .map((f) => f.category)
        .join(", ")}`,
    );
    this.name = "ForbiddenClaimError";
    this.findings = findings;
  }
}

/**
 * Assert copy is publishable. Throws `ForbiddenClaimError` (with findings) if
 * any forbidden claim is present. Returns the (empty) findings on success so
 * callers can log a clean scan.
 */
export function assertNoForbiddenClaims(text: string): ForbiddenClaimFinding[] {
  const findings = scanForForbiddenClaims(text);
  if (findings.length > 0) {
    throw new ForbiddenClaimError(findings);
  }
  return findings;
}
