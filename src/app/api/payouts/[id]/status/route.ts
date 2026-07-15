/**
 * PATCH /api/payouts/[id]/status — payout state-machine transitions.
 *
 * Admin-only. Legal transitions:
 *   pending  → approved | rejected
 *   approved → paid | rejected
 *   paid     → (terminal — immutable)
 *   rejected → (terminal)
 *
 * A `paid` payout is immutable: any attempted change is rejected at the app
 * layer with a clear 409 BEFORE hitting the DB (the 0009 trigger enforces the
 * same rule as defense-in-depth for direct SQL). Every transition writes an
 * audit row (`money.payout_status_changed`) with before/after in the same
 * transaction. Transitioning to `paid` stamps `paid_at`.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { payoutStatusUpdateSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Allowed next states keyed by current state. */
const TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: [],
  rejected: [],
};

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = await parseJson(req);
    const input = payoutStatusUpdateSchema.parse(body);

    const outcome = await getServiceDb().transaction(async (tx) => {
      const [before] = await tx.query<{
        id: string;
        status: string;
        amount_cents: string;
      }>("select * from payouts where id = $1 for update", [id]);
      if (!before) return { kind: "not_found" as const };

      // Paid is immutable at the app layer (DB trigger also blocks it).
      if (before.status === "paid") {
        return { kind: "immutable" as const };
      }

      // No-op is allowed (idempotent).
      if (before.status === input.status) {
        return { kind: "ok" as const, before, after: before, noop: true };
      }

      const allowed = TRANSITIONS[before.status] ?? [];
      if (!allowed.includes(input.status)) {
        return {
          kind: "illegal" as const,
          from: before.status,
          to: input.status,
        };
      }

      const isPaid = input.status === "paid";
      const [after] = await tx.query<Record<string, unknown>>(
        `update payouts
           set status = $2::payout_status,
               notes = coalesce($3, notes),
               external_ref = coalesce($4, external_ref),
               paid_at = case when $5 then now() else paid_at end
         where id = $1
         returning *`,
        [id, input.status, input.notes ?? null, input.external_ref ?? null, isPaid],
      );

      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "money.payout_status_changed",
          entityType: "payouts",
          entityId: id,
          before: { status: before.status },
          after: { status: input.status },
        },
        tx,
      );
      return { kind: "ok" as const, before, after, noop: false };
    });

    if (outcome.kind === "not_found") return jsonError(404, "Payout not found");
    if (outcome.kind === "immutable") {
      return jsonError(409, "Payout is paid and is immutable", {
        code: "payout_paid_immutable",
      });
    }
    if (outcome.kind === "illegal") {
      return jsonError(
        409,
        `Illegal transition ${outcome.from} → ${outcome.to}`,
        { code: "illegal_transition" },
      );
    }
    return NextResponse.json({ payout: outcome.after });
  } catch (err) {
    return handleRouteError(err);
  }
}
