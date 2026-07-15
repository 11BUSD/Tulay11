/**
 * GET /api/admin/due-diligence — read partner due-diligence reviews.
 *
 * Admin-only. Filters: `?partnerId=`, `?outcome=`. Joins the partner name so
 * the admin screen can label each review without a second lookup.
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
    const { where, params } = buildWhere([
      ["d.partner_id", url.searchParams.get("partnerId")],
      ["d.outcome", url.searchParams.get("outcome")],
    ]);

    const rows = await getServiceDb().query(
      `select d.id, d.partner_id, p.name as partner_name, d.reviewer_id,
              d.outcome, d.checklist, d.notes, d.reviewed_at, d.created_at
         from due_diligence_reviews d
         left join partners p on p.id = d.partner_id
         ${where}
        order by d.created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ reviews: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
