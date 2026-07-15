/**
 * GET /r/[code] — ambassador referral deep-link.
 *
 * Resolves an ambassador `referral_code`, sets a first-party attribution cookie
 * (`tulay_ref`) so subsequent offer clicks can credit the ambassador, and
 * 302-redirects into the app. An UNKNOWN code never crashes — it redirects to
 * the landing page without setting the cookie. A valid code redirects to the
 * onboarding entry (or `?to=` when provided and same-origin).
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { REFERRAL_COOKIE } from "@/lib/api/referrals";

export const runtime = "nodejs";

/** 30-day attribution window. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await ctx.params;
  const origin = new URL(req.url).origin;

  // Only allow same-origin relative redirect targets; default to onboarding.
  const toParam = new URL(req.url).searchParams.get("to");
  const safeTo =
    toParam && toParam.startsWith("/") && !toParam.startsWith("//")
      ? toParam
      : "/onboarding";

  let ambassadorId: string | null = null;
  try {
    const [amb] = await getServiceDb().query<{ id: string }>(
      "select id from ambassadors where referral_code = $1 and status = 'active'",
      [code],
    );
    ambassadorId = amb?.id ?? null;
  } catch {
    // DB error → fail safe: treat as an invalid code, no crash.
    ambassadorId = null;
  }

  // Invalid / unknown code → land on the homepage without attribution.
  if (!ambassadorId) {
    return NextResponse.redirect(new URL("/", origin), 302);
  }

  const res = NextResponse.redirect(new URL(safeTo, origin), 302);
  res.cookies.set(REFERRAL_COOKIE, code, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
  });
  return res;
}
