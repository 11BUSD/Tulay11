/**
 * POST /api/outreach/messages/[id]/reject — human rejection of a draft.
 *
 * Admin-only (human). Requires a reason. Transitions `drafted → rejected`
 * (guarded), stamping `rejected_reason`, and writes an audit row.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, parseJson } from "@/lib/api/http";
import { uuidSchema, outreachRejectSchema } from "@/lib/validation";
import { transitionMessage } from "@/lib/outreach/state-machine";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    uuidSchema.parse(id);
    const input = outreachRejectSchema.parse(await parseJson(req));

    const updated = await transitionMessage(id, "rejected", {
      actorId: actor.id,
      actorType: "human",
      reasoning: input.reason,
      columns: { rejected_reason: input.reason },
      db: getServiceDb(),
    });

    return NextResponse.json({ message: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
