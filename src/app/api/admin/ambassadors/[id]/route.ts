/**
 * PATCH /api/admin/ambassadors/[id] — update an ambassador's status.
 *
 * Admin-only. Supports the activate/suspend workflow: sets `status` to one of
 * `active | paused | inactive` and writes an audit row (before/after) in the
 * same transaction. Kept minimal — only the status field is mutable here.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ambassadorStatusSchema = z.object({
  status: z.enum(["active", "paused", "inactive"]),
});

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    const input = ambassadorStatusSchema.parse(await parseJson(req));

    const updated = await getServiceDb().transaction(async (tx) => {
      const [before] = await tx.query<{ id: string; status: string }>(
        "select id, status from ambassadors where id = $1",
        [id],
      );
      if (!before) return null;

      const [after] = await tx.query<Record<string, unknown>>(
        "update ambassadors set status = $2, updated_at = now() where id = $1 returning *",
        [id, input.status],
      );
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "ambassador.status_changed",
          entityType: "ambassadors",
          entityId: id,
          before: { status: before.status },
          after: { status: input.status },
        },
        tx,
      );
      return after;
    });

    if (!updated) return jsonError(404, "Ambassador not found");
    return NextResponse.json({ ambassador: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
