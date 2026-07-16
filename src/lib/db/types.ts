/**
 * Database type stubs. The full generated Supabase types + entity interfaces
 * are added by the data-model task once migrations exist. Kept intentionally
 * minimal so downstream imports have a stable target.
 */

/** Placeholder for the generated Supabase `Database` type. */
export type Database = Record<string, unknown>;

/** UUID string alias for readability in row types. */
export type Uuid = string;

/** ISO-8601 timestamp string. */
export type Timestamp = string;

/** Money is always stored as integer cents (never float). */
export type Cents = number;

/** Percentages stored as integer basis points (1% = 100 bps). */
export type BasisPoints = number;
