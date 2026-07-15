/**
 * GET /api/referrals/click — record a referral click and 302 to the offer.
 *
 * Public (no admin guard) — this is the link a user follows. It:
 *   1. resolves the target offer from `?offer=` (a partner_offers id),
 *   2. mints a `referral_id` (url-safe token) via `generateReferralId`,
 *   3. resolves the visitor: `user_id` from a resolved session actor if any,
 *      else an `anonymous_id` from `?anon=`/`tulay_anon` cookie,
 *   4. resolves an `ambassador_id` from `?ref=` (ambassadors.referral_code),
 *   5. captures UTM params + user-agent, and the request IP HASHED (never raw),
 *   6. inserts a `referral_clicks` row + audit, then
 *   7. 302-redirects to the offer's `destination_url` with referral_id +
 *      tracking_code + utm params appended via `buildRedirectUrl`.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import {
  buildRedirectUrl,
  generateReferralId,
  hashIp,
} from "@/lib/referral";
import { resolveActor } from "@/lib/auth/roles";
import { clientIp, handleRouteError, jsonError } from "@/lib/api/http";
import { REFERRAL_COOKIE } from "@/lib/api/referrals";

export const runtime = "nodejs";

/** Read a cookie value from the request's Cookie header. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const offerId = url.searchParams.get("offer");
    if (!offerId) return jsonError(400, "Query param 'offer' is required");

    const db = getServiceDb();
    const [offer] = await db.query<{
      id: string;
      destination_url: string | null;
      tracking_code: string | null;
    }>(
      "select id, destination_url, tracking_code from partner_offers where id = $1",
      [offerId],
    );
    if (!offer) return jsonError(404, "Offer not found");
    if (!offer.destination_url) {
      return jsonError(422, "Offer has no destination_url");
    }

    // Visitor resolution: authenticated user id, else anonymous id.
    const actor = await resolveActor(req).catch(() => null);
    const userId = actor?.id ?? null;
    const anonymousId =
      url.searchParams.get("anon") ?? readCookie(req, "tulay_anon") ?? null;

    // Ambassador resolution: explicit ?ref= wins, else the `tulay_ref`
    // attribution cookie set by the /r/<code> deep-link entry point (so the
    // normal deep-link → browse → offer-click flow still credits the
    // ambassador even though no ?ref= is present on the offer link).
    const refCode =
      url.searchParams.get("ref") ?? readCookie(req, REFERRAL_COOKIE);
    let ambassadorId: string | null = null;
    if (refCode) {
      const [amb] = await db.query<{ id: string }>(
        "select id from ambassadors where referral_code = $1",
        [refCode],
      );
      ambassadorId = amb?.id ?? null;
    }

    const referralId = generateReferralId();
    const ip = clientIp(req);
    const ipHash = ip ? hashIp(ip) : null;

    const utm = {
      utm_source: url.searchParams.get("utm_source"),
      utm_medium: url.searchParams.get("utm_medium"),
      utm_campaign: url.searchParams.get("utm_campaign"),
      utm_content: url.searchParams.get("utm_content"),
      utm_term: url.searchParams.get("utm_term"),
    };

    const click = await db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string; referral_id: string }>(
        `insert into referral_clicks
           (referral_id, user_id, anonymous_id, ambassador_id, partner_offer_id,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            ip_hash, user_agent)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         returning id, referral_id`,
        [
          referralId,
          userId,
          anonymousId,
          ambassadorId,
          offerId,
          utm.utm_source,
          utm.utm_medium,
          utm.utm_campaign,
          utm.utm_content,
          utm.utm_term,
          ipHash,
          req.headers.get("user-agent"),
        ],
      );
      await recordAudit(
        {
          actorId: userId,
          actorType: "system",
          action: "referral.click_recorded",
          entityType: "referral_clicks",
          entityId: row.id,
          after: {
            referral_id: row.referral_id,
            partner_offer_id: offerId,
            ambassador_id: ambassadorId,
          },
          // Only the hashed IP is ever recorded — raw IP is never stored.
          sourceMeta: ipHash ? { ip_hash: ipHash } : null,
        },
        tx,
      );
      return row;
    });

    const redirectUrl = buildRedirectUrl(offer.destination_url, {
      referral_id: click.referral_id,
      tracking_code: offer.tracking_code ?? undefined,
      utm_source: utm.utm_source ?? undefined,
      utm_medium: utm.utm_medium ?? undefined,
      utm_campaign: utm.utm_campaign ?? undefined,
      utm_content: utm.utm_content ?? undefined,
      utm_term: utm.utm_term ?? undefined,
    });

    return NextResponse.redirect(redirectUrl, 302);
  } catch (err) {
    return handleRouteError(err);
  }
}
