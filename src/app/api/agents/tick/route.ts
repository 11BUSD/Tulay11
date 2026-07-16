/**
 * POST /api/agents/tick — cron-drained queue drain.
 *
 * Admin-only. Claims up to `limit` queued/expired-lock tasks (via FOR UPDATE
 * SKIP LOCKED) and executes them. This is the entry point an external scheduler
 * (or pg_cron) hits to drive scheduled follow-ups. Returns the runs processed.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { agentTickSchema } from "@/lib/validation";
import { handleRouteError, parseJson } from "@/lib/api/http";
import { AgentRunner } from "@/lib/agents/runner";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    let input = { limit: 5 };
    try {
      input = agentTickSchema.parse(await parseJson(req));
    } catch {
      // Empty/absent body is fine — use defaults.
    }

    const db = getServiceDb();
    const runner = new AgentRunner({ db });
    const runs = await runner.tick(input.limit, { db });

    return NextResponse.json({
      processed: runs.length,
      runs: runs.map((r) => ({ id: r.id, status: r.status })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
