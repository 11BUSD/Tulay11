/**
 * POST /api/referrals/conversion — record a conversion → commission → payout.
 *
 * Admin-guarded (called by partner postbacks / internal tooling). Everything
 * happens in ONE `ServiceDb.transaction` so the conversion, its computed
 * commission, the pending payout(s), the ambassador split + referral row, the
 * audit log, and the revenue attribution event all commit atomically.
 *
 * Flow:
 *   1. validate `referral_id` maps to a `referral_clicks` row,
 *   2. idempotency: if `external_reference` was already recorded, return the
 *      existing conversion untouched,
 *   3. lead_form conversions require an effective `lead_referral` consent for
 *      the subject (else 403),
 *   4. compute the commission via `computeCommission` using the matching
 *      `commission_rules` row (per-offer, else the global rule for the offer's
 *      commission_type), falling back to the offer's own commission fields,
 *   5. create the conversion + a PENDING payout (payee ambassador when the
 *      click carried one, else the partner),
 *   6. when an ambassador drove the click, split the commission with
 *      `splitCommission` and create the ambassador split payout (linked to the
 *      parent) + an `ambassador_referrals` row (no cent lost),
 *   7. write the audit row + a revenue attribution event.
 *
 * Money is strictly integer cents — all math goes through `money.ts`.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb, type ServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { computeCommission, splitCommission } from "@/lib/money";
import type { CommissionRuleLike, CommissionType } from "@/lib/money";
import { requireConsent } from "@/lib/compliance/consent";
import { conversionInputSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

interface OfferRow {
  id: string;
  partner_id: string;
  offer_type: string;
  commission_type: CommissionType;
  commission_value_cents: string | number;
}

/** Raw commission_rules row — bigint columns arrive from pg as strings. */
interface RawRuleRow {
  id: string;
  commission_type: CommissionType;
  value_cents: string | number | null;
  percentage_bps: number | null;
  recurring_max_periods: number | null;
  min_value_cents: string | number | null;
  max_value_cents: string | number | null;
}

/** Coerce a nullable pg bigint (string|number|null) to number|null. */
function toNum(v: string | number | null | undefined): number | null {
  return v == null ? null : Number(v);
}

/** Normalize a raw rule row into a `CommissionRuleLike` with integer fields. */
function normalizeRule(r: RawRuleRow): CommissionRuleLike {
  return {
    commission_type: r.commission_type,
    value_cents: toNum(r.value_cents),
    percentage_bps: r.percentage_bps,
    recurring_max_periods: r.recurring_max_periods,
    min_value_cents: toNum(r.min_value_cents),
    max_value_cents: toNum(r.max_value_cents),
  };
}

/** True when the conversion is a lead-form submission (needs consent). */
function isLeadForm(conversionType: string, offerType: string): boolean {
  return (
    conversionType.toLowerCase().includes("lead_form") ||
    conversionType.toLowerCase().includes("lead") ||
    offerType === "lead_form"
  );
}

/** Resolve the commission rule for an offer (per-offer, else global-by-type). */
async function resolveRule(
  tx: ServiceDb,
  offer: OfferRow,
): Promise<{ rule: CommissionRuleLike; ruleId: string | null }> {
  const [perOffer] = await tx.query<RawRuleRow>(
    `select * from commission_rules
       where partner_offer_id = $1 and active = true
       order by created_at desc limit 1`,
    [offer.id],
  );
  if (perOffer) return { rule: normalizeRule(perOffer), ruleId: perOffer.id };

  const [global] = await tx.query<RawRuleRow>(
    `select * from commission_rules
       where partner_offer_id is null and active = true
         and commission_type = $1
       order by created_at desc limit 1`,
    [offer.commission_type],
  );
  if (global) return { rule: normalizeRule(global), ruleId: global.id };

  // Fallback: the offer's own commission fields.
  return {
    rule: {
      commission_type: offer.commission_type,
      value_cents: Number(offer.commission_value_cents),
    },
    ruleId: null,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = conversionInputSchema.parse(body);
    const db = getServiceDb();

    // 1. Validate the referral_id → click.
    const [click] = await db.query<{
      id: string;
      partner_offer_id: string;
      ambassador_id: string | null;
      user_id: string | null;
      anonymous_id: string | null;
    }>(
      `select id, partner_offer_id, ambassador_id, user_id, anonymous_id
         from referral_clicks where referral_id = $1`,
      [input.referral_id],
    );
    if (!click) return jsonError(404, "Unknown referral_id");

    // 2. Idempotency: return the existing conversion if this external_reference
    //    was already recorded.
    if (input.external_reference) {
      const [existing] = await db.query(
        "select * from referral_conversions where external_conversion_id = $1",
        [input.external_reference],
      );
      if (existing) {
        return NextResponse.json(
          { conversion: existing, idempotent: true },
          { status: 200 },
        );
      }
    }

    // Load the offer (for commission type + partner).
    const [offer] = await db.query<OfferRow>(
      `select id, partner_id, offer_type, commission_type, commission_value_cents
         from partner_offers where id = $1`,
      [click.partner_offer_id],
    );
    if (!offer) return jsonError(422, "Offer for this click no longer exists");

    // 3. lead_form conversions require consent for the subject.
    if (isLeadForm(input.conversion_type, offer.offer_type)) {
      if (input.subject_id == null && input.subject_email == null) {
        return jsonError(
          403,
          "lead_form conversion requires a consent subject (subject_id or subject_email)",
        );
      }
      // Throws ConsentRequiredError (403) when there's no effective grant.
      await requireConsent(
        "lead_referral",
        { subjectId: input.subject_id, subjectEmail: input.subject_email },
        db,
      );
    }

    const result = await db.transaction(async (tx) => {
      // 4. Commission via the resolved rule (period 1 = first recurring period).
      const { rule, ruleId } = await resolveRule(tx, offer);
      const gross = input.conversion_value_cents;
      const commission = computeCommission(rule, gross, 1);

      // 5. Conversion row.
      const [conversion] = await tx.query<{ id: string }>(
        `insert into referral_conversions
           (referral_click_id, partner_offer_id, user_id, anonymous_id, status,
            gross_value_cents, commission_amount_cents, commission_rule_id,
            external_conversion_id, metadata)
         values ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)
         returning *`,
        [
          click.id,
          offer.id,
          click.user_id,
          click.anonymous_id,
          gross,
          commission,
          ruleId,
          input.external_reference ?? null,
          JSON.stringify(input.metadata),
        ],
      );
      const conversionId = (conversion as { id: string }).id;

      // Primary PENDING payout: payee = ambassador when the click had one,
      // else the partner. Amount = the full commission.
      const payeeType = click.ambassador_id ? "ambassador" : "partner";
      const [parentPayout] = await tx.query<{ id: string; amount_cents: string }>(
        `insert into payouts
           (conversion_id, ambassador_id, partner_id, payee_type, amount_cents,
            status)
         values ($1,$2,$3,$4,$5,'pending')
         returning id, amount_cents`,
        [
          conversionId,
          click.ambassador_id,
          offer.partner_id,
          payeeType,
          commission,
        ],
      );
      const parentId = (parentPayout as { id: string }).id;

      // 6. Ambassador split (only when the click carried an ambassador).
      let split: {
        payoutId: string;
        ambassadorCents: number;
        remainderCents: number;
      } | null = null;
      if (click.ambassador_id) {
        const [amb] = await tx.query<{ split_percentage_bps: number }>(
          "select split_percentage_bps from ambassadors where id = $1",
          [click.ambassador_id],
        );
        const splitBps = amb?.split_percentage_bps ?? 0;
        const { ambassadorCents, remainderCents } = splitCommission(
          commission,
          splitBps,
        );
        const [splitPayout] = await tx.query<{ id: string }>(
          `insert into payouts
             (conversion_id, ambassador_id, partner_id, payee_type, amount_cents,
              status, parent_payout_id)
           values ($1,$2,$3,'ambassador',$4,'pending',$5)
           returning id`,
          [conversionId, click.ambassador_id, offer.partner_id, ambassadorCents, parentId],
        );
        const splitPayoutId = (splitPayout as { id: string }).id;
        await tx.query(
          `insert into ambassador_referrals
             (ambassador_id, referral_click_id, conversion_id, attributed_amount_cents)
           values ($1,$2,$3,$4)`,
          [click.ambassador_id, click.id, conversionId, ambassadorCents],
        );
        split = { payoutId: splitPayoutId, ambassadorCents, remainderCents };
      }

      // 7. Audit + revenue attribution event.
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "money.conversion_recorded",
          entityType: "referral_conversions",
          entityId: conversionId,
          after: {
            gross_value_cents: gross,
            commission_amount_cents: commission,
            commission_rule_id: ruleId,
            payout_id: parentId,
            ambassador_split_cents: split?.ambassadorCents ?? null,
          },
        },
        tx,
      );
      await tx.query(
        `insert into revenue_attribution_events
           (event_type, partner_id, partner_offer_id, conversion_id,
            ambassador_id, amount_cents, metadata)
         values ('conversion',$1,$2,$3,$4,$5,$6)`,
        [
          offer.partner_id,
          offer.id,
          conversionId,
          click.ambassador_id,
          commission,
          JSON.stringify({ gross_value_cents: gross }),
        ],
      );

      return {
        conversion,
        commission_amount_cents: commission,
        payout_id: parentId,
        split,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
