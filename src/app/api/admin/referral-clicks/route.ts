/**
 * GET /api/admin/referral-clicks — read the referral-click log.
 *
 * Admin-only. Filters: `?partnerOfferId=`, `?ambassadorId=`. Paginated via
 * `?limit=` (default 50, max 200). `ip_hash` is already stored hashed (never
 * raw) — it is returned as the hash and the admin table renders it via
 * MaskedField (AC7 data minimization). `user_agent` is omitted from the select.
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
    const partnerOfferId = url.searchParams.get("partnerOfferId");
    const ambassadorId = url.searchParams.get("ambassadorId");
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1),
      200,
    );

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (partnerOfferId) {
      params.push(partnerOfferId);
      clauses.push(`partner_offer_id = $${params.length}`);
    }
    if (ambassadorId) {
      params.push(ambassadorId);
      clauses.push(`ambassador_id = $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const rows = await getServiceDb().query(
      `select id, referral_id, user_id, ambassador_id, partner_offer_id,
              utm_source, utm_medium, utm_campaign, ip_hash, created_at
         from referral_clicks ${where}
        order by created_at desc
        limit ${limit}`,
      params,
    );
    return NextResponse.json({ clicks: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
