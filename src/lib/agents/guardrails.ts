/**
 * Agent guardrails — the safety layer applied to agent output before it is
 * persisted or surfaced.
 *
 *   - `assertNoInventedTerms(output, sources)` — every partner/offer TERM the
 *     agent emitted must trace to a stored `DueDiligenceReview` / `PartnerAgreement`
 *     source ref. An unmapped term is a fabrication risk: it throws (or, in
 *     lenient mode, returns a high-severity risk flag).
 *   - `caslCheck(draft)` — a draft must carry sender identity, a stated reason
 *     for outreach, a working opt-out, and no misleading/guaranteed-return
 *     claims. Any missing element is a BLOCKING risk flag so the message cannot
 *     be approved until corrected.
 *   - confidence-floor helpers standardize the "land in needs_review" thresholds.
 *
 * These are pure functions (no DB/LLM) so they are trivially unit-testable and
 * reusable by every agent.
 */
import type { DataSource, RiskFlag } from "./types";
import { scanForForbiddenClaims } from "../compliance/contentGuardrails";

/** Default confidence floor: runs below this land in `needs_review`. */
export const DEFAULT_CONFIDENCE_FLOOR = 0.5;

/** A term the agent claims about a partner/offer, with the value it asserted. */
export interface AssertedTerm {
  /** Field/term name, e.g. `commission_value_cents`, `commission_type`. */
  term: string;
  /** The asserted value (stringified for comparison). */
  value: string | number;
}

/** Error thrown when an agent output references an unsourced term. */
export class InventedTermError extends Error {
  readonly code = "invented_term" as const;
  readonly terms: string[];
  constructor(terms: string[]) {
    super(`Agent output references unsourced term(s): ${terms.join(", ")}`);
    this.name = "InventedTermError";
    this.terms = terms;
  }
}

/**
 * Assert that every asserted partner/offer term maps to a source ref. A term is
 * considered "sourced" when its `term` name (or `term=value`) appears in the
 * `ref`/`note` of a `db`-kind source pointing at a `due_diligence_reviews` or
 * `partner_agreements` record.
 *
 * @param terms   the terms the agent asserted.
 * @param sources the `dataSources` array the agent returned.
 * @param opts.lenient when true, return risk flags instead of throwing.
 * @returns high-severity risk flags for each unmapped term (empty when clean).
 */
export function assertNoInventedTerms(
  terms: AssertedTerm[],
  sources: DataSource[],
  opts: { lenient?: boolean } = {},
): RiskFlag[] {
  const sourceText = sources
    .filter((s) => s.kind === "db")
    .filter(
      (s) =>
        /due_diligence_reviews|partner_agreements/i.test(s.ref) ||
        /due_diligence_reviews|partner_agreements/i.test(s.note ?? ""),
    )
    .map((s) => `${s.ref} ${s.note ?? ""}`)
    .join(" \n ")
    .toLowerCase();

  const unmapped: string[] = [];
  for (const t of terms) {
    const term = t.term.toLowerCase();
    const value = String(t.value).toLowerCase();
    const mapped =
      sourceText.includes(term) || (value !== "" && sourceText.includes(value));
    if (!mapped) unmapped.push(t.term);
  }

  if (unmapped.length === 0) return [];

  if (!opts.lenient) {
    throw new InventedTermError(unmapped);
  }
  return unmapped.map((term) => ({
    code: "invented_term",
    severity: "high" as const,
    message: `Term '${term}' is not backed by a DueDiligenceReview/PartnerAgreement source.`,
  }));
}

/** A draft's shape for CASL checking. */
export interface CaslDraft {
  subject?: string | null;
  body: string;
  /** Known sender identity strings that must be present (e.g. "Tulay"). */
  senderName?: string;
}

/**
 * Verify a draft meets CASL requirements. Returns a list of BLOCKING risk
 * flags (severity `high`) for each missing/violating element; empty when the
 * draft is compliant. Callers attach these to the draft so the approval route
 * refuses to approve a message carrying any blocking flag.
 */
export function caslCheck(draft: CaslDraft): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const body = (draft.body ?? "").toString();
  const lower = body.toLowerCase();
  const sender = (draft.senderName ?? "Tulay").toLowerCase();

  // (1) Sender identity present.
  if (!lower.includes(sender)) {
    flags.push({
      code: "casl_missing_sender_identity",
      severity: "high",
      message: "Draft does not identify the sender (Tulay).",
    });
  }

  // (2) Stated reason for outreach — heuristic: mentions partnership/reaching out.
  if (
    !/\b(partner|partnership|reaching out|reach out|opportunity|collaborat|introduc)\b/i.test(
      body,
    )
  ) {
    flags.push({
      code: "casl_missing_reason",
      severity: "high",
      message: "Draft does not state a reason for the outreach.",
    });
  }

  // (3) Working opt-out mechanism.
  if (!/\b(unsubscribe|opt[- ]?out|reply stop|no longer wish)\b/i.test(body)) {
    flags.push({
      code: "casl_missing_optout",
      severity: "high",
      message: "Draft does not include a working opt-out/unsubscribe mechanism.",
    });
  }

  // (4) No misleading / guaranteed-return claims (reuse content guardrails).
  const forbidden = scanForForbiddenClaims(`${draft.subject ?? ""}\n${body}`);
  for (const f of forbidden) {
    flags.push({
      code: `casl_misleading_${f.category}`,
      severity: "high",
      message: `Misleading/forbidden claim: ${f.message}`,
    });
  }

  return flags;
}

/** True when a risk-flag list contains at least one blocking (high) flag. */
export function hasBlockingRiskFlag(flags: RiskFlag[]): boolean {
  return flags.some((f) => f.severity === "high");
}

/**
 * Decide the terminal status for a run given its confidence + risk flags. A run
 * below the confidence floor OR carrying any high-severity flag lands in
 * `needs_review` rather than auto-completing.
 */
export function resolveStatus(
  confidence: number,
  riskFlags: RiskFlag[],
  floor: number = DEFAULT_CONFIDENCE_FLOOR,
): "succeeded" | "needs_review" {
  if (confidence < floor) return "needs_review";
  if (hasBlockingRiskFlag(riskFlags)) return "needs_review";
  return "succeeded";
}
