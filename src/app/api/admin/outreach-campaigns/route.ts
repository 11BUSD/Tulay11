/**
 * GET /api/admin/outreach-campaigns — read outreach campaigns with counts.
 *
 * Admin-only. Filters: `?status=`. Rolls up message counts per campaign so the
 * admin screen can show queue size at a glance.
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
      ["c.status", url.searchParams.get("status")],
    ]);

    const rows = await getServiceDb().query(
      `select c.id, c.name, c.goal, c.channel, c.status, c.created_at,
              coalesce(m.message_count, 0)::text as message_count,
              coalesce(m.awaiting_count, 0)::text as awaiting_count
         from outreach_campaigns c
         left join (
           select campaign_id,
                  count(*) as message_count,
                  count(*) filter (where state = 'drafted') as awaiting_count
             from outreach_messages
            group by campaign_id
         ) m on m.campaign_id = c.id
         ${where}
        order by c.created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ campaigns: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
