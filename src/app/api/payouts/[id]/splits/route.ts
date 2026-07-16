/**
 * POST /api/payouts/[id]/splits — create an ambassador split from a parent payout.
 *
 * Admin-only. Given a parent payout, splits its amount with `splitCommission`
 * (integer cents, no cent lost) using the ambassador's `split_percentage_bps`
 * (or an override `split_bps`), then creates a child ambassador payout linked
 * via `parent_payout_id`, an `ambassador_referrals` row, a revenue attribution
 * event, and an audit row — all in ONE transaction.
 *
 * The ambassador is taken from `?`/body `ambassador_id`, else inherited from the
 * parent payout's `ambassador_id`, else the parent's conversion's click.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { splitCommission } from "@/lib/money";
import { payoutSplitSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = await parseJson(req);
    const input = payoutSplitSchema.parse(body);

    const outcome = await getServiceDb().transaction(async (tx) => {
      const [parent] = await tx.query<{
        id: string;
        conversion_id: string | null;
        ambassador_id: string | null;
        partner_id: string | null;
        amount_cents: string;
        status: string;
      }>("select * from payouts where id = $1", [id]);
      if (!parent) return { kind: "not_found" as const };

      // A paid parent is immutable (the DB trigger would reject the reducing
      // UPDATE below anyway) — reject the split before doing any work.
      if (parent.status === "paid") return { kind: "parent_paid" as const };

      // Idempotency / no double-booking: if this parent already has a child
      // split payout, return it untouched rather than stacking another child
      // (and reducing the parent again). Splits are one-per-parent.
      const [existingChild] = await tx.query<{
        id: string;
        amount_cents: string;
      }>(
        "select id, amount_cents from payouts where parent_payout_id = $1 limit 1",
        [parent.id],
      );
      if (existingChild) {
        return {
          kind: "ok" as const,
          split_payout: existingChild,
          ambassador_cents: Number(existingChild.amount_cents),
          remainder_cents: Number(parent.amount_cents),
          idempotent: true,
        };
      }

      // Resolve the ambassador: explicit → parent → parent's conversion click.
      let ambassadorId = input.ambassador_id ?? parent.ambassador_id ?? null;
      if (!ambassadorId && parent.conversion_id) {
        const [row] = await tx.query<{ ambassador_id: string | null }>(
          `select rc.ambassador_id
             from referral_conversions c
             join referral_clicks rc on rc.id = c.referral_click_id
            where c.id = $1`,
          [parent.conversion_id],
        );
        ambassadorId = row?.ambassador_id ?? null;
      }
      if (!ambassadorId) return { kind: "no_ambassador" as const };

      const [amb] = await tx.query<{ split_percentage_bps: number }>(
        "select split_percentage_bps from ambassadors where id = $1",
        [ambassadorId],
      );
      if (!amb) return { kind: "no_ambassador" as const };

      const splitBps = input.split_bps ?? amb.split_percentage_bps ?? 0;
      const total = Number(parent.amount_cents);
      const { ambassadorCents, remainderCents } = splitCommission(total, splitBps);

      const [child] = await tx.query<{ id: string }>(
        `insert into payouts
           (conversion_id, ambassador_id, partner_id, payee_type, amount_cents,
            status, parent_payout_id, notes)
         values ($1,$2,$3,'ambassador',$4,'pending',$5,$6)
         returning *`,
        [
          parent.conversion_id,
          ambassadorId,
          parent.partner_id,
          ambassadorCents,
          parent.id,
          input.notes ?? null,
        ],
      );
      const childId = (child as { id: string }).id;

      // Reduce the parent to the remainder so parent + child == the original
      // amount (no inflated liability, no double-pay). Parent is not paid
      // (guarded above), so this UPDATE is permitted.
      await tx.query(
        "update payouts set amount_cents = $2 where id = $1",
        [parent.id, remainderCents],
      );

      await tx.query(
        `insert into ambassador_referrals
           (ambassador_id, conversion_id, attributed_amount_cents)
         values ($1,$2,$3)`,
        [ambassadorId, parent.conversion_id, ambassadorCents],
      );

      await tx.query(
        `insert into revenue_attribution_events
           (event_type, partner_id, conversion_id, ambassador_id, amount_cents, metadata)
         values ('payout',$1,$2,$3,$4,$5)`,
        [
          parent.partner_id,
          parent.conversion_id,
          ambassadorId,
          ambassadorCents,
          JSON.stringify({ parent_payout_id: parent.id, split_bps: splitBps }),
        ],
      );

      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "money.payout_split_created",
          entityType: "payouts",
          entityId: childId,
          after: {
            parent_payout_id: parent.id,
            ambassador_id: ambassadorId,
            split_bps: splitBps,
            ambassador_cents: ambassadorCents,
            remainder_cents: remainderCents,
          },
        },
        tx,
      );

      return {
        kind: "ok" as const,
        split_payout: child,
        ambassador_cents: ambassadorCents,
        remainder_cents: remainderCents,
        idempotent: false,
      };
    });

    if (outcome.kind === "not_found") return jsonError(404, "Payout not found");
    if (outcome.kind === "parent_paid") {
      return jsonError(409, "Cannot split a paid payout");
    }
    if (outcome.kind === "no_ambassador") {
      return jsonError(422, "No ambassador resolved for this payout split");
    }
    return NextResponse.json(
      {
        split_payout: outcome.split_payout,
        ambassador_cents: outcome.ambassador_cents,
        remainder_cents: outcome.remainder_cents,
        idempotent: outcome.idempotent ?? false,
      },
      // An existing split is returned idempotently (200); a new one is 201.
      { status: outcome.idempotent ? 200 : 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
