/**
 * GET /api/admin/referral-conversions — read validated/attributed conversions.
 *
 * Admin-only. Filters: `?status=`, `?partnerOfferId=`. Paginated via `?limit=`
 * (default 50, max 200). Money columns are bigint (integer cents) and returned
 * as strings by node-postgres — the client coerces before `formatCents`.
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
    const status = url.searchParams.get("status");
    const partnerOfferId = url.searchParams.get("partnerOfferId");
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1),
      200,
    );

    const { where, params } = buildWhere([
      ["status", status],
      ["partner_offer_id", partnerOfferId],
    ]);

    const rows = await getServiceDb().query(
      `select id, referral_click_id, partner_offer_id, user_id, status,
              gross_value_cents, commission_amount_cents, commission_rule_id,
              external_conversion_id, created_at
         from referral_conversions ${where}
        order by created_at desc
        limit ${limit}`,
      params,
    );
    return NextResponse.json({ conversions: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
