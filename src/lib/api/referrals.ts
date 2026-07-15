/** Client module for referral attribution cookies (deep-link support). */

/** Cookie set by /r/[code] carrying the ambassador attribution. */
export const REFERRAL_COOKIE = "tulay_ref";

/** Read the current referral attribution code from document.cookie. */
export function getReferralCode(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === REFERRAL_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}
