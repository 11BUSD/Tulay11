/**
 * GET /api/payouts — list payouts + a liability summary.
 *
 * Admin-only. Supports `?status=`, `?ambassador_id=`, `?partner_id=` filters.
 * Returns the matching payout rows plus a `summary` of outstanding liability
 * (total cents by status), so the admin ledger can show what is owed.
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
      ["status", url.searchParams.get("status")],
      ["ambassador_id", url.searchParams.get("ambassador_id")],
      ["partner_id", url.searchParams.get("partner_id")],
    ]);

    const db = getServiceDb();
    const rows = await db.query(
      `select * from payouts ${where} order by created_at desc`,
      params,
    );

    // Liability summary across ALL payouts (integer cents), grouped by status.
    const summaryRows = await db.query<{
      status: string;
      total_cents: string;
      count: string;
    }>(
      `select status, sum(amount_cents)::text as total_cents, count(*)::text as count
         from payouts group by status`,
    );
    const summary: Record<string, { total_cents: number; count: number }> = {};
    let outstandingCents = 0;
    for (const s of summaryRows) {
      const total = Number(s.total_cents);
      summary[s.status] = { total_cents: total, count: Number(s.count) };
      if (s.status === "pending" || s.status === "approved") {
        outstandingCents += total;
      }
    }

    return NextResponse.json({
      payouts: rows,
      summary: { by_status: summary, outstanding_liability_cents: outstandingCents },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
