/**
 * GET /api/agents/runs/[id] — run detail.
 *
 * Admin-only. Returns the full run including output, reasoning summary, data
 * sources, confidence, and risk flags, plus its tasks.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, HttpError } from "@/lib/api/http";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    uuidSchema.parse(id);

    const db = getServiceDb();
    const [run] = await db.query(
      "select * from agent_runs where id = $1",
      [id],
    );
    if (!run) throw new HttpError(404, "Run not found");

    const tasks = await db.query(
      "select id, task_key, status, attempt, max_attempts, scheduled_for, created_at from agent_tasks where run_id = $1 order by created_at asc",
      [id],
    );

    return NextResponse.json({ run, tasks });
  } catch (err) {
    return handleRouteError(err);
  }
}
