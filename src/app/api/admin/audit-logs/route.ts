/**
 * GET /api/admin/audit-logs — paginated read of the append-only audit trail.
 *
 * Admin-only. Filters: `?entityType=`, `?action=`, `?actorType=`. Paginated via
 * `?limit=` (default 50, max 200) + `?offset=`. IPs are already stored hashed
 * upstream and never appear in audit rows; the `before`/`after` snapshots are
 * returned as-is (they hold entity state, not raw contact PII) so operators can
 * see what changed.
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
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1),
      200,
    );
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

    const { where, params } = buildWhere([
      ["entity_type", url.searchParams.get("entityType")],
      ["action", url.searchParams.get("action")],
      ["actor_type", url.searchParams.get("actorType")],
    ]);

    const db = getServiceDb();
    const filterCount = params.length;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = await db.query(
      `select id, actor_id, actor_type, action, entity_type, entity_id,
              before, after, reasoning, agent_run_id, created_at
         from audit_logs ${where}
        order by created_at desc
        limit $${limitIdx} offset $${offsetIdx}`,
      params,
    );

    const [{ count }] = await db.query<{ count: string }>(
      `select count(*)::text as count from audit_logs ${where}`,
      params.slice(0, filterCount),
    );

    return NextResponse.json({
      logs: rows,
      pagination: { limit, offset, total: Number(count) },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
