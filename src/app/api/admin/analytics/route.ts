/**
 * GET /api/admin/analytics — product + revenue analytics for the operator
 * dashboard (Task 23).
 *
 * Admin-only. Computes a single metrics payload from the existing tables:
 *   - users count + activation (activated = users with any click / conversion /
 *     save),
 *   - the pillar funnel (starts = referral_clicks by settlement pillar,
 *     completions = validated conversions by pillar),
 *   - offer impressions (click ledger), clicks, conversions, conversion rate,
 *   - attributed revenue (integer cents), revenue per user, revenue by partner,
 *   - payout liability (unpaid = pending + approved),
 *   - CAC / LTV (STUB formulas — see constants; real spend/retention data is
 *     not yet captured, so these are clearly-labelled estimates),
 *   - ambassador performance (attributed referrals + amount + payouts).
 *
 * All money is integer cents; node-postgres returns bigint columns as STRINGS,
 * so every aggregate is coerced with `Number(...)` before use.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * STUB acquisition-cost assumption (integer cents). Real ad/referral spend is
 * not yet captured; the dashboard labels CAC as an estimate. Kept as a single
 * constant so it's obvious this is a placeholder, not a computed value.
 */
const STUB_CAC_CENTS = 1500; // $15.00 assumed blended acquisition cost.

/** Coerce a bigint-as-string (or number/null) into a safe integer. */
function int(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Ratio helper guarding divide-by-zero. */
function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

interface PillarFunnelRow {
  pillar: string;
  starts: number;
  completions: number;
}

interface PartnerRevenueRow {
  partner: string;
  revenue_cents: number;
}

interface AmbassadorPerfRow {
  ambassador: string;
  referrals: number;
  attributed_cents: number;
  paid_cents: number;
}

interface AnalyticsResponse {
  users: number;
  activated_users: number;
  activation_rate: number;
  offer_impressions: number;
  clicks: number;
  conversions: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_user_cents: number;
  payout_liability_cents: number;
  /** CAC/LTV are STUB estimates (see STUB_CAC_CENTS). */
  cac_cents: number;
  ltv_cents: number;
  ltv_to_cac: number;
  pillar_funnel: PillarFunnelRow[];
  revenue_by_partner: PartnerRevenueRow[];
  ambassadors: AmbassadorPerfRow[];
  /** Flags which numbers are estimated vs. measured. */
  estimated: string[];
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const db = getServiceDb();

    // --- Users + activation -------------------------------------------------
    const [{ users }] = await db.query<{ users: string }>(
      `select count(*)::text as users from users`,
    );
    const [{ activated }] = await db.query<{ activated: string }>(
      `select count(distinct uid)::text as activated from (
         select user_id as uid from referral_clicks where user_id is not null
         union
         select user_id from referral_conversions where user_id is not null
         union
         select subject_ref::uuid from saved_resources
           where subject_ref ~ '^[0-9a-fA-F-]{36}$'
       ) t`,
    );

    // --- Clicks / conversions ----------------------------------------------
    const [{ clicks }] = await db.query<{ clicks: string }>(
      `select count(*)::text as clicks from referral_clicks`,
    );
    const [{ conversions }] = await db.query<{ conversions: string }>(
      `select count(*)::text as conversions
         from referral_conversions where status = 'validated'`,
    );

    // --- Pillar funnel: starts (clicks) vs completions (validated convs) ----
    const funnelRows = await db.query<{
      pillar: string | null;
      starts: string;
      completions: string;
    }>(
      `select o.settlement_pillar as pillar,
              count(distinct rc.id)::text as starts,
              count(distinct case when conv.status = 'validated' then conv.id end)::text
                as completions
         from partner_offers o
         left join referral_clicks rc on rc.partner_offer_id = o.id
         left join referral_conversions conv on conv.partner_offer_id = o.id
        group by o.settlement_pillar
        having count(rc.id) > 0 or count(conv.id) > 0
        order by count(rc.id) desc`,
    );

    // --- Revenue ------------------------------------------------------------
    const [{ revenue }] = await db.query<{ revenue: string }>(
      `select coalesce(sum(amount_cents), 0)::text as revenue
         from revenue_attribution_events`,
    );
    const partnerRows = await db.query<{
      partner: string | null;
      revenue_cents: string;
    }>(
      `select p.name as partner,
              coalesce(sum(e.amount_cents), 0)::text as revenue_cents
         from revenue_attribution_events e
         left join partners p on p.id = e.partner_id
        group by p.name
        order by coalesce(sum(e.amount_cents), 0) desc`,
    );

    // --- Payout liability (unpaid = pending + approved) ---------------------
    const [{ liability }] = await db.query<{ liability: string }>(
      `select coalesce(sum(amount_cents), 0)::text as liability
         from payouts where status in ('pending', 'approved')`,
    );

    // --- Ambassador performance --------------------------------------------
    const ambassadorRows = await db.query<{
      ambassador: string;
      referrals: string;
      attributed_cents: string;
      paid_cents: string;
    }>(
      `select a.name as ambassador,
              count(distinct ar.id)::text as referrals,
              coalesce(sum(ar.attributed_amount_cents), 0)::text as attributed_cents,
              coalesce((
                select sum(pay.amount_cents) from payouts pay
                 where pay.ambassador_id = a.id and pay.status = 'paid'
              ), 0)::text as paid_cents
         from ambassadors a
         left join ambassador_referrals ar on ar.ambassador_id = a.id
        group by a.id, a.name
        order by coalesce(sum(ar.attributed_amount_cents), 0) desc`,
    );

    const usersN = int(users);
    const activatedN = int(activated);
    const clicksN = int(clicks);
    const conversionsN = int(conversions);
    const revenueN = int(revenue);
    const revenuePerUser = usersN > 0 ? Math.trunc(revenueN / usersN) : 0;

    // CAC/LTV: stub estimate — LTV proxied by revenue per user (single-period),
    // CAC a fixed assumption until real spend is captured.
    const cacCents = STUB_CAC_CENTS;
    const ltvCents = revenuePerUser;

    const body: AnalyticsResponse = {
      users: usersN,
      activated_users: activatedN,
      activation_rate: ratio(activatedN, usersN),
      // No separate impression ledger yet: clicks are the impression proxy.
      offer_impressions: clicksN,
      clicks: clicksN,
      conversions: conversionsN,
      conversion_rate: ratio(conversionsN, clicksN),
      revenue_cents: revenueN,
      revenue_per_user_cents: revenuePerUser,
      payout_liability_cents: int(liability),
      cac_cents: cacCents,
      ltv_cents: ltvCents,
      ltv_to_cac: ratio(ltvCents, cacCents),
      pillar_funnel: funnelRows.map((r) => ({
        pillar: r.pillar ?? "(unassigned)",
        starts: int(r.starts),
        completions: int(r.completions),
      })),
      revenue_by_partner: partnerRows.map((r) => ({
        partner: r.partner ?? "(unattributed)",
        revenue_cents: int(r.revenue_cents),
      })),
      ambassadors: ambassadorRows.map((r) => ({
        ambassador: r.ambassador,
        referrals: int(r.referrals),
        attributed_cents: int(r.attributed_cents),
        paid_cents: int(r.paid_cents),
      })),
      estimated: ["offer_impressions", "cac_cents", "ltv_cents", "ltv_to_cac"],
    };

    return NextResponse.json(body);
  } catch (err) {
    return handleRouteError(err);
  }
}
