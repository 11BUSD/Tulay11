/**
 * Opaque subject reference for keying saved resources.
 *
 * There is no authenticated session in this MVP, so saved items are keyed by a
 * stable, opaque, client-generated reference stored in `localStorage`. It
 * carries no PII — it exists only to group a browser's saved offers. When real
 * auth lands, this should switch to the authenticated subject id.
 */
const SUBJECT_REF_KEY = "tulay_subject_ref";

/** Generate an opaque random reference (best-effort, no PII). */
function generate(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Return the current browser's opaque subject reference, creating and
 * persisting one on first use. On the server (no `window`) it returns a
 * throwaway value since saving is a client-only action.
 */
export function getSubjectRef(): string {
  if (typeof window === "undefined") return generate();
  try {
    const existing = window.localStorage.getItem(SUBJECT_REF_KEY);
    if (existing) return existing;
    const created = generate();
    window.localStorage.setItem(SUBJECT_REF_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (private mode / disabled) — fall back to a
    // per-call ref; saves still succeed, they just won't group across reloads.
    return generate();
  }
}
