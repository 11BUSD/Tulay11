/**
 * POST /api/outreach/replies — log a reply to a sent message.
 *
 * Admin-only. Transitions `sent | follow_up_due → replied` (guarded). When
 * `meeting_booked` is set, it additionally advances `replied → meeting_booked`.
 * Writes audit rows for each transition.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, parseJson } from "@/lib/api/http";
import { outreachReplySchema } from "@/lib/validation";
import { transitionMessage } from "@/lib/outreach/state-machine";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const input = outreachReplySchema.parse(await parseJson(req));
    const db = getServiceDb();

    let updated = await transitionMessage(input.message_id, "replied", {
      actorId: actor.id,
      actorType: "human",
      reasoning: input.body ? `Reply logged: ${input.body.slice(0, 200)}` : null,
      db,
    });

    if (input.meeting_booked) {
      updated = await transitionMessage(input.message_id, "meeting_booked", {
        actorId: actor.id,
        actorType: "human",
        db,
      });
    }

    return NextResponse.json({ message: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
