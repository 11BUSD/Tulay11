/**
 * GET /api/agents/runs — list agent runs.
 *
 * Admin-only. Filters: `?agentKey=`, `?status=`, `?partnerId=`, `?contactId=`,
 * `?campaignId=`. Returns runs newest-first.
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
    const filters: Array<[string, string | null]> = [
      ["agent_key", url.searchParams.get("agentKey")],
      ["status", url.searchParams.get("status")],
      ["related_partner_id", url.searchParams.get("partnerId")],
      ["related_contact_id", url.searchParams.get("contactId")],
      ["related_campaign_id", url.searchParams.get("campaignId")],
    ];

    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const [col, val] of filters) {
      if (val != null) {
        params.push(val);
        clauses.push(`${col} = $${params.length}`);
      }
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const rows = await getServiceDb().query(
      `select id, agent_key, agent_version, status, trigger_type, triggered_by,
              confidence, reasoning_summary, related_partner_id,
              related_contact_id, related_campaign_id, attempt, error,
              started_at, finished_at, created_at
         from agent_runs ${where}
        order by created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ runs: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
