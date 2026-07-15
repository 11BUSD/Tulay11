/**
 * GET /api/admin/outreach-contacts — read outreach contacts.
 *
 * Admin-only. Filters: `?partnerId=`, `?consentStatus=`. Contacts are business
 * counterparties (partner org contacts), not end-user newcomers. The admin
 * table masks the email via MaskedField and does NOT expose phone in exports —
 * the `phone` column is intentionally omitted from the select (AC7 data
 * minimization).
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
      ["c.partner_id", url.searchParams.get("partnerId")],
      ["c.consent_status", url.searchParams.get("consentStatus")],
    ]);

    const rows = await getServiceDb().query(
      `select c.id, c.partner_id, p.name as partner_name, c.name, c.email,
              c.role, c.source, c.status, c.tags, c.consent_status,
              c.consent_basis, c.created_at
         from outreach_contacts c
         left join partners p on p.id = c.partner_id
         ${where}
        order by c.created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ contacts: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
