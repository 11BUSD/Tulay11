/**
 * GET /api/admin/ambassadors — list ambassadors with referral rollups.
 *
 * Admin-only. Filters: `?status=`, `?filipinoFocus=`. Aggregates each
 * ambassador's referral count + attributed amount (integer cents) from
 * `ambassador_referrals` so the admin screen can rank them without N+1 queries.
 * Raw email/phone are contact PII but belong to the ambassador (a business
 * counterparty, not an end-user newcomer) so they are returned for operations;
 * the admin table masks the email via MaskedField for defense-in-depth.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { buildWhere, handleRouteError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const filipino = url.searchParams.get("filipinoFocus");

    const { where, params } = buildWhere([
      ["a.status", url.searchParams.get("status")],
      ["a.filipino_focus", filipino != null ? filipino === "true" : null],
    ]);

    const rows = await getServiceDb().query(
      `select a.id, a.name, a.email, a.phone, a.referral_code, a.languages,
              a.city, a.filipino_focus, a.split_percentage_bps, a.status,
              a.created_at,
              coalesce(r.referral_count, 0)::text as referral_count,
              coalesce(r.attributed_cents, 0)::text as attributed_cents
         from ambassadors a
         left join (
           select ambassador_id,
                  count(*) as referral_count,
                  sum(attributed_amount_cents) as attributed_cents
             from ambassador_referrals
            group by ambassador_id
         ) r on r.ambassador_id = a.id
         ${where}
        order by coalesce(r.attributed_cents, 0) desc, a.created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ ambassadors: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
