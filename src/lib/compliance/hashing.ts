/**
 * PII hashing — HMAC-SHA256 with a server-side salt, version-prefixed.
 *
 * High-sensitivity identifiers (IP addresses, emails for pre-account leads) are
 * NEVER stored raw. They are hashed here with `COMPLIANCE_HASH_SALT` and the
 * output is prefixed with a salt version (`v1:`) so we can rotate the salt later
 * without ambiguity about which salt produced a given hash. Hashing is
 * deterministic (same input + salt → same hash) so we can match/dedupe on the
 * hash, and the raw value is never returned.
 */
import { createHmac } from "node:crypto";

/** Current salt version prefix. Bump when the salt rotates. */
export const HASH_VERSION = "v1";

/**
 * Resolve the HMAC salt from the environment. Read lazily (per call) so
 * importing this module never throws when the env is absent (e.g. during a
 * build without secrets). The configured value may itself already carry a `v1:`
 * prefix (as in `.env.local`); we strip any leading version tag so the salt
 * material is stable regardless of how it was written.
 */
function getSalt(): string {
  const salt = process.env.COMPLIANCE_HASH_SALT;
  if (!salt) {
    throw new Error("COMPLIANCE_HASH_SALT is not set");
  }
  // Strip a leading "vN:" tag if present so the underlying key is consistent.
  return salt.replace(/^v\d+:/, "");
}

/**
 * Core HMAC-SHA256 over a normalized value, returning `v1:<hex>`. Not exported —
 * callers use the typed `hashIp` / `hashEmail` wrappers which normalize input.
 */
function hmac(normalized: string): string {
  const digest = createHmac("sha256", getSalt())
    .update(normalized)
    .digest("hex");
  return `${HASH_VERSION}:${digest}`;
}

/**
 * Hash an IP address. Trims surrounding whitespace; the value is treated
 * case-sensitively otherwise (IPv6 is already normalized by callers/transport).
 */
export function hashIp(ip: string): string {
  if (typeof ip !== "string" || ip.trim() === "") {
    throw new Error("hashIp requires a non-empty ip string");
  }
  return hmac(ip.trim());
}

/**
 * Hash an email address. Lower-cased + trimmed first so the hash is stable
 * regardless of the casing the user typed (emails are case-insensitive for
 * matching purposes here).
 */
export function hashEmail(email: string): string {
  if (typeof email !== "string" || email.trim() === "") {
    throw new Error("hashEmail requires a non-empty email string");
  }
  return hmac(email.trim().toLowerCase());
}

/** True if a stored value looks like a versioned hash (never a raw value). */
export function isHashed(value: string | null | undefined): boolean {
  return typeof value === "string" && /^v\d+:[0-9a-f]{64}$/.test(value);
}
