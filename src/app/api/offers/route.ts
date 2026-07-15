/**
 * /api/offers — list (GET) and create (POST) partner offers.
 *
 * Admin-only. Create is zod-validated, verifies the referenced
 * `settlement_pillar` exists and the partner exists, and writes an audit row in
 * the same transaction as the insert. List supports `?pillar=`, `?partner_id=`,
 * `?active=` filters.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { offerCreateSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const pillar = url.searchParams.get("pillar");
    const partnerId = url.searchParams.get("partner_id");
    const active = url.searchParams.get("active");

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (pillar) {
      params.push(pillar);
      clauses.push(`settlement_pillar = $${params.length}`);
    }
    if (partnerId) {
      params.push(partnerId);
      clauses.push(`partner_id = $${params.length}`);
    }
    if (active != null) {
      params.push(active === "true");
      clauses.push(`active = $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

    const rows = await getServiceDb().query(
      `select * from partner_offers ${where}
         order by priority_score desc, created_at desc`,
      params,
    );
    return NextResponse.json({ offers: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = offerCreateSchema.parse(body);
    const db = getServiceDb();

    // Referential validation the DB FK also enforces — done up front so we can
    // return a clean 400 instead of a raw constraint-violation 500.
    const pillar = await db.query(
      "select 1 from settlement_pillars where slug = $1",
      [input.settlement_pillar],
    );
    if (pillar.length === 0) {
      return jsonError(400, `Unknown settlement_pillar '${input.settlement_pillar}'`);
    }
    const partner = await db.query("select 1 from partners where id = $1", [
      input.partner_id,
    ]);
    if (partner.length === 0) {
      return jsonError(400, `Unknown partner_id '${input.partner_id}'`);
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into partner_offers
           (partner_id, title, description, settlement_pillar, offer_type,
            destination_url, tracking_code, commission_type,
            commission_value_cents, user_reward_value_cents, eligibility_rules,
            city_targets, language_targets, active, priority_score,
            compliance_notes, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         returning *`,
        [
          input.partner_id,
          input.title,
          input.description ?? null,
          input.settlement_pillar,
          input.offer_type,
          input.destination_url ?? null,
          input.tracking_code ?? null,
          input.commission_type,
          input.commission_value_cents,
          input.user_reward_value_cents,
          JSON.stringify(input.eligibility_rules),
          input.city_targets,
          input.language_targets,
          input.active,
          input.priority_score,
          input.compliance_notes ?? null,
          input.status,
        ],
      );
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "offer.created",
          entityType: "partner_offers",
          entityId: (row as { id: string }).id,
          after: row,
        },
        tx,
      );
      return row;
    });

    return NextResponse.json({ offer: created }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
