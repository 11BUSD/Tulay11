/**
 * GET /api/admin/due-diligence — read partner due-diligence reviews.
 *
 * Admin-only. Filters: `?partnerId=`, `?outcome=`. Joins the partner name so
 * the admin screen can label each review without a second lookup.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const partnerId = url.searchParams.get("partnerId");
    const outcome = url.searchParams.get("outcome");

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (partnerId) {
      params.push(partnerId);
      clauses.push(`d.partner_id = $${params.length}`);
    }
    if (outcome) {
      params.push(outcome);
      clauses.push(`d.outcome = $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

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
