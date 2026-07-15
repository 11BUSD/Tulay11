/**
 * GET /api/outreach/messages — the approval queue.
 *
 * Admin-only. Lists outreach messages, filterable by `?state=` (defaults to no
 * filter). Includes the draft fields + risk flags so the admin console can show
 * blocking flags in the queue.
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
    const state = url.searchParams.get("state");
    const campaignId = url.searchParams.get("campaignId");

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (state) {
      params.push(state);
      clauses.push(`state = $${params.length}`);
    }
    if (campaignId) {
      params.push(campaignId);
      clauses.push(`campaign_id = $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const rows = await getServiceDb().query(
      `select id, campaign_id, contact_id, direction, subject, body, state,
              draft_subject, draft_body, draft_reasoning, draft_confidence,
              draft_risk_flags, generated_by_run_id, sequence_step, dedupe_hash,
              follow_up_due_at, approved_by, approved_at, rejected_reason,
              sent_at, provider_message_id, simulated, created_at, updated_at
         from outreach_messages ${where}
        order by created_at desc
        limit 200`,
      params,
    );
    return NextResponse.json({ messages: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}
