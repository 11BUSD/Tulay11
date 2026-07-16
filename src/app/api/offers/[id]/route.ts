/**
 * /api/offers/[id] — read (GET), update (PATCH), delete (DELETE) an offer.
 *
 * Admin-only. PATCH validates a changed `settlement_pillar` exists. Every
 * mutation writes an audit row in the same transaction.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { offerUpdateSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Columns a PATCH may update (eligibility_rules serialized separately). */
const UPDATABLE = [
  "title",
  "description",
  "settlement_pillar",
  "offer_type",
  "destination_url",
  "tracking_code",
  "commission_type",
  "commission_value_cents",
  "user_reward_value_cents",
  "city_targets",
  "language_targets",
  "active",
  "priority_score",
  "compliance_notes",
  "status",
] as const;

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const rows = await getServiceDb().query(
      "select * from partner_offers where id = $1",
      [id],
    );
    if (rows.length === 0) return jsonError(404, "Offer not found");
    return NextResponse.json({ offer: rows[0] });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = await parseJson(req);
    const input = offerUpdateSchema.parse(body);
    const db = getServiceDb();

    if (input.settlement_pillar !== undefined) {
      const pillar = await db.query(
        "select 1 from settlement_pillars where slug = $1",
        [input.settlement_pillar],
      );
      if (pillar.length === 0) {
        return jsonError(
          400,
          `Unknown settlement_pillar '${input.settlement_pillar}'`,
        );
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [before] = await tx.query<Record<string, unknown>>(
        "select * from partner_offers where id = $1",
        [id],
      );
      if (!before) return null;

      const sets: string[] = [];
      const params: unknown[] = [];
      for (const col of UPDATABLE) {
        if (col in input && input[col as keyof typeof input] !== undefined) {
          params.push(input[col as keyof typeof input]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (input.eligibility_rules !== undefined) {
        params.push(JSON.stringify(input.eligibility_rules));
        sets.push(`eligibility_rules = $${params.length}`);
      }
      let row = before;
      if (sets.length > 0) {
        params.push(id);
        const [next] = await tx.query<Record<string, unknown>>(
          `update partner_offers set ${sets.join(", ")} where id = $${params.length} returning *`,
          params,
        );
        row = next;
      }

      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "offer.updated",
          entityType: "partner_offers",
          entityId: id,
          before,
          after: row,
        },
        tx,
      );
      return row;
    });

    if (!updated) return jsonError(404, "Offer not found");
    return NextResponse.json({ offer: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;

    const deleted = await getServiceDb().transaction(async (tx) => {
      const [before] = await tx.query<Record<string, unknown>>(
        "select * from partner_offers where id = $1",
        [id],
      );
      if (!before) return null;
      await tx.query("delete from partner_offers where id = $1", [id]);
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "offer.deleted",
          entityType: "partner_offers",
          entityId: id,
          before,
        },
        tx,
      );
      return before;
    });

    if (!deleted) return jsonError(404, "Offer not found");
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    return handleRouteError(err);
  }
}
