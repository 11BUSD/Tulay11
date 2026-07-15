/**
 * Admin display formatters. node-postgres returns `bigint` columns (money cents,
 * counts) as STRINGS; these helpers coerce to integer before formatting so the
 * OfferCard bigint bug (float/NaN money) never recurs in admin tables.
 */
import { formatCents } from "@/lib/money";

/** Coerce a possibly-string bigint into a safe integer (0 on bad input). */
export function toInt(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Format integer cents (coercing string bigints) for display. */
export function money(
  value: number | string | null | undefined,
  currency = "CAD",
): string {
  return formatCents(toInt(value), currency);
}

/** Format an integer count (coercing string bigints) with thousands grouping. */
export function count(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("en-CA").format(toInt(value));
}

/** Format an ISO timestamp for dense admin tables (null → em dash). */
export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
