/**
 * Money math — integer cents only, percentages as integer basis points (bps).
 *
 * NEVER use floats for storage or math here: every amount is an integer number
 * of cents and every percentage is an integer number of basis points (1% = 100
 * bps). All public helpers guard their inputs and throw on non-integer/negative
 * values where those are invalid, so a bad value fails loudly instead of being
 * silently rounded or coerced.
 */

/** Commission type discriminator (mirrors the `commission_type` enum). */
export type CommissionType = "fixed" | "percentage" | "recurring" | "manual";

/**
 * The subset of a `commission_rules` row that commission math needs. Kept
 * structural (not the full DB row) so callers can pass a rule loaded from any
 * source as long as it carries these fields.
 */
export interface CommissionRuleLike {
  commission_type: CommissionType;
  /** Fixed amount, or per-period amount for recurring rules (integer cents). */
  value_cents?: number | null;
  /** Percentage as integer basis points (for `percentage` rules). */
  percentage_bps?: number | null;
  /** Max number of periods a recurring commission is paid for. */
  recurring_max_periods?: number | null;
  /** Lower clamp applied to the computed commission (integer cents). */
  min_value_cents?: number | null;
  /** Upper clamp applied to the computed commission (integer cents). */
  max_value_cents?: number | null;
}

/** Throw if `value` is not a safe integer. */
function assertInteger(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} exceeds the safe integer range: ${value}`);
  }
}

/** Throw if `value` is not a non-negative safe integer. */
function assertNonNegativeInteger(value: number, label: string): void {
  assertInteger(value, label);
  if (value < 0) {
    throw new Error(`${label} must be >= 0, got ${value}`);
  }
}

/**
 * Apply a basis-points percentage to an integer cent amount.
 * `Math.round(amountCents * bps / 10000)` — result is always an integer.
 */
export function applyPercentageBps(amountCents: number, bps: number): number {
  assertNonNegativeInteger(amountCents, "amountCents");
  assertNonNegativeInteger(bps, "bps");
  return Math.round((amountCents * bps) / 10000);
}

/** Clamp `value` to the optional [min, max] range (nulls = no bound). */
function clamp(
  value: number,
  min?: number | null,
  max?: number | null,
): number {
  let out = value;
  if (min != null) {
    assertNonNegativeInteger(min, "min_value_cents");
    if (out < min) out = min;
  }
  if (max != null) {
    assertNonNegativeInteger(max, "max_value_cents");
    if (out > max) out = max;
  }
  return out;
}

/**
 * Compute a commission for a conversion, dispatching on the rule's
 * `commission_type`:
 *   - fixed      → `value_cents`
 *   - percentage → `applyPercentageBps(grossCents, percentage_bps)`
 *   - recurring  → per-period `value_cents`, only for periods within
 *                  `recurring_max_periods` (period beyond the cap yields 0)
 *   - manual     → 0 (an admin must set the amount explicitly)
 * The result is clamped by `min_value_cents` / `max_value_cents` when present.
 *
 * `period` is 1-based (period 1 = first recurring payment) and only used for
 * recurring rules.
 */
export function computeCommission(
  rule: CommissionRuleLike,
  grossCents: number,
  period = 1,
): number {
  assertNonNegativeInteger(grossCents, "grossCents");

  let raw: number;
  switch (rule.commission_type) {
    case "fixed":
      raw = rule.value_cents ?? 0;
      assertNonNegativeInteger(raw, "value_cents");
      break;
    case "percentage":
      raw = applyPercentageBps(grossCents, rule.percentage_bps ?? 0);
      break;
    case "recurring": {
      assertInteger(period, "period");
      if (period < 1) {
        throw new Error(`period must be >= 1 for recurring rules, got ${period}`);
      }
      const maxPeriods = rule.recurring_max_periods;
      if (maxPeriods != null) {
        assertNonNegativeInteger(maxPeriods, "recurring_max_periods");
        if (period > maxPeriods) return 0;
      }
      raw = rule.value_cents ?? 0;
      assertNonNegativeInteger(raw, "value_cents");
      break;
    }
    case "manual":
      // Manual commissions require an explicit admin-entered amount; the rule
      // itself yields nothing computable.
      return 0;
    default: {
      const exhaustive: never = rule.commission_type;
      throw new Error(`Unknown commission_type: ${String(exhaustive)}`);
    }
  }

  return clamp(raw, rule.min_value_cents, rule.max_value_cents);
}

/** Result of splitting a commission between an ambassador and the remainder. */
export interface CommissionSplit {
  ambassadorCents: number;
  remainderCents: number;
}

/**
 * Split a total commission into an ambassador cut (`splitBps` basis points) and
 * the remainder. The remainder is `total - ambassadorCents` so no cent is ever
 * lost or created — the two parts always sum back to `totalCents`.
 */
export function splitCommission(
  totalCents: number,
  splitBps: number,
): CommissionSplit {
  assertNonNegativeInteger(totalCents, "totalCents");
  assertNonNegativeInteger(splitBps, "splitBps");
  if (splitBps > 10000) {
    throw new Error(`splitBps must be <= 10000 (100%), got ${splitBps}`);
  }
  const ambassadorCents = applyPercentageBps(totalCents, splitBps);
  return { ambassadorCents, remainderCents: totalCents - ambassadorCents };
}

/**
 * Format integer cents for display (never for storage/math). Defaults to CAD.
 */
export function formatCents(cents: number, currency = "CAD"): string {
  assertInteger(cents, "cents");
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
