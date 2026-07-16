/**
 * POST /api/outreach/messages/[id]/approve — human approval of a draft.
 *
 * Admin-only (human). Refuses to approve if the draft carries any BLOCKING
 * (high-severity) risk flag — CASL failures, suppression, etc. On success it
 * transitions `drafted → approved` (guarded state machine), stamping
 * `approved_by`/`approved_at`, and writes an audit row.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, HttpError } from "@/lib/api/http";
import { uuidSchema } from "@/lib/validation";
import { transitionMessage } from "@/lib/outreach/state-machine";
import { hasBlockingRiskFlag } from "@/lib/agents/guardrails";
import type { RiskFlag } from "@/lib/agents/types";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    uuidSchema.parse(id);

    const db = getServiceDb();
    const [message] = await db.query<{
      state: string;
      draft_risk_flags: unknown;
    }>(
      "select state, draft_risk_flags from outreach_messages where id = $1",
      [id],
    );
    if (!message) throw new HttpError(404, "Message not found");

    // Block approval when a blocking risk flag is present.
    const flags = normalizeFlags(message.draft_risk_flags);
    if (hasBlockingRiskFlag(flags)) {
      throw new HttpError(422, "Cannot approve: draft has blocking risk flags", {
        code: "blocking_risk_flags",
        risk_flags: flags.filter((f) => f.severity === "high"),
      });
    }

    const updated = await transitionMessage(id, "approved", {
      actorId: actor.id,
      actorType: "human",
      columns: { approved_by: actor.id, approved_at: new Date().toISOString() },
      db,
    });

    return NextResponse.json({ message: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Coerce stored draft_risk_flags (jsonb) into a RiskFlag[]. */
function normalizeFlags(raw: unknown): RiskFlag[] {
  if (Array.isArray(raw)) return raw as RiskFlag[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RiskFlag[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
