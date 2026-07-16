/**
 * POST /api/attribution — record a revenue attribution event.
 *
 * Admin-guarded. Inserts a `revenue_attribution_events` row and writes an audit
 * log in the same transaction. Money is integer cents.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { attributionInputSchema } from "@/lib/validation";
import { handleRouteError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = attributionInputSchema.parse(body);

    const created = await getServiceDb().transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into revenue_attribution_events
           (event_type, partner_id, partner_offer_id, conversion_id,
            ambassador_id, amount_cents, currency, metadata)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning *`,
        [
          input.event_type,
          input.partner_id ?? null,
          input.partner_offer_id ?? null,
          input.conversion_id ?? null,
          input.ambassador_id ?? null,
          input.amount_cents,
          input.currency,
          JSON.stringify(input.metadata),
        ],
      );
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "revenue.attribution_recorded",
          entityType: "revenue_attribution_events",
          entityId: (row as { id: string }).id,
          after: row,
        },
        tx,
      );
      return row;
    });

    return NextResponse.json({ event: created }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
