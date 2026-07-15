/**
 * Re-exports of design-token names for use in TypeScript (e.g. mapping status
 * values to colors). The canonical values live in `src/app/globals.css` as CSS
 * custom properties; these reference the same variables.
 */
export const colorTokens = {
  brand: "var(--color-brand)",
  brandDark: "var(--color-brand-dark)",
  brandSoft: "var(--color-brand-soft)",
  accent: "var(--color-accent)",
  accentSoft: "var(--color-accent-soft)",
  gold: "var(--color-gold)",
  goldSoft: "var(--color-gold-soft)",
  canvas: "var(--color-canvas)",
  surface: "var(--color-surface)",
  surfaceAlt: "var(--color-surface-alt)",
  ink: "var(--color-ink)",
  inkSoft: "var(--color-ink-soft)",
  inkMuted: "var(--color-ink-muted)",
  line: "var(--color-line)",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
  admin: "var(--color-admin)",
  adminCanvas: "var(--color-admin-canvas)",
} as const;

export type ColorToken = keyof typeof colorTokens;

/** Progress / status states used across dashboard + admin surfaces. */
export const statusColor = {
  notStarted: colorTokens.inkMuted,
  inProgress: colorTokens.gold,
  complete: colorTokens.success,
  error: colorTokens.danger,
} as const;

export type StatusState = keyof typeof statusColor;
