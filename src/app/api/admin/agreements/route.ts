/**
 * GET /api/admin/agreements — read partner agreements.
 *
 * Admin-only. Filters: `?partnerId=`, `?status=`. Joins the partner name so the
 * admin screen can label each agreement.
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
    const status = url.searchParams.get("status");

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (partnerId) {
      params.push(partnerId);
      clauses.push(`ag.partner_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`ag.status = $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const rows = await getServiceDb().query(
      `select ag.id, ag.partner_id, p.name as partner_name, ag.status,
              ag.terms_summary, ag.document_url, ag.effective_at, ag.expires_at,
              ag.signed_at, ag.created_at
         from partner_agreements ag
         left join partners p on p.id = ag.partner_id
         ${where}
        order by ag.created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ agreements: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
