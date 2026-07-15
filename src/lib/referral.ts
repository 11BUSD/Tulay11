/**
 * Referral helpers: token generation, IP hashing, and redirect-URL building.
 *
 * `referral_id` is an externally-visible, URL-safe token. IP hashing delegates
 * to the compliance hashing layer (raw IPs are never stored). `buildRedirectUrl`
 * appends tracking params to a partner destination URL while preserving any
 * query string the destination already has.
 */
import { randomBytes } from "node:crypto";
import { hashIp as complianceHashIp } from "./compliance/hashing";

/**
 * Generate a URL-safe referral token. Uses 18 random bytes encoded as
 * base64url (no `+`, `/`, or `=` padding) → 24 chars, ~144 bits of entropy, so
 * collisions are astronomically unlikely and the token is safe in a URL path or
 * query without escaping.
 */
export function generateReferralId(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Hash an IP address for storage. Delegates to the compliance hashing helper so
 * there is a single HMAC/salt path for all PII (raw IP never persisted).
 */
export function hashIp(ip: string): string {
  return complianceHashIp(ip);
}

/** Tracking params appended to a partner destination URL. */
export interface RedirectParams {
  referral_id?: string;
  tracking_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/**
 * Append tracking params to `destinationUrl`, preserving any existing query
 * string on the destination. Only defined, non-empty params are added; an
 * existing param of the same name is overwritten so the referral's values win.
 */
export function buildRedirectUrl(
  destinationUrl: string,
  params: RedirectParams,
): string {
  const url = new URL(destinationUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
