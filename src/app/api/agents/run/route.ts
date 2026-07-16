/**
 * POST /api/agents/run — trigger an agent run (inline, synchronous).
 *
 * Admin-only. Enqueues the run (idempotency-keyed: a duplicate returns the
 * existing run without re-running), then executes it inline (Q1 model A). The
 * LLM provider is the mock in test/CI, so no network call is made there.
 * Returns the runId + final status.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { agentRunSchema } from "@/lib/validation";
import { handleRouteError, parseJson } from "@/lib/api/http";
import { AgentRunner } from "@/lib/agents/runner";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = agentRunSchema.parse(body);

    const db = getServiceDb();
    const runner = new AgentRunner({ db });

    const { run, task, deduped } = await runner.enqueue(
      input.agent_key,
      input.input,
      {
        entityId: input.entity_id ?? null,
        triggerType: "manual",
        triggeredBy: actor.id,
        relatedPartnerId: input.related_partner_id ?? null,
        relatedContactId: input.related_contact_id ?? null,
        relatedCampaignId: input.related_campaign_id ?? null,
        db,
      },
    );

    // Execute inline unless this was a dedupe of an already-terminal run.
    // A queued run (fresh or a not-yet-executed dupe) is executed; a run that
    // already finished/failed is returned as-is (idempotent — no double work).
    let finalRun = run;
    if (run.status === "queued" && task) {
      finalRun = await runner.execute(task.id, { db });
    }

    return NextResponse.json(
      {
        runId: finalRun.id,
        status: finalRun.status,
        deduped,
      },
      { status: deduped ? 200 : 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
