/**
 * GET /api/admin/revenue — sliceable revenue aggregates (Task 21 / AC9).
 *
 * Admin-only. Aggregates `revenue_attribution_events` (the append-only revenue
 * ledger, integer cents) into totals grouped by one of six dimensions via
 * `?groupBy=`:
 *   - pillar     → partner_offers.settlement_pillar
 *   - partner    → partners.name
 *   - offer      → partner_offers.title
 *   - channel    → revenue_attribution_events.metadata->>'channel'
 *   - ambassador → ambassadors.name
 *   - cohort     → month bucket of occurred_at (revenue over time)
 *
 * All money is returned as integer cents (bigint columns coerced to number).
 * Also returns the payout-liability summary (unpaid = pending + approved) so
 * the analytics screen can show it without a second round-trip.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

/** The six sliceable dimensions and how each is expressed in SQL. */
const GROUP_BY = {
  pillar: {
    label: "o.settlement_pillar",
    join: "left join partner_offers o on o.id = e.partner_offer_id",
  },
  partner: {
    label: "p.name",
    join: "left join partners p on p.id = e.partner_id",
  },
  offer: {
    label: "o.title",
    join: "left join partner_offers o on o.id = e.partner_offer_id",
  },
  channel: {
    label: "e.metadata->>'channel'",
    join: "",
  },
  ambassador: {
    label: "a.name",
    join: "left join ambassadors a on a.id = e.ambassador_id",
  },
  cohort: {
    label: "to_char(date_trunc('month', e.occurred_at), 'YYYY-MM')",
    join: "",
  },
} as const;

export type RevenueGroupBy = keyof typeof GROUP_BY;

function isGroupBy(value: string): value is RevenueGroupBy {
  return Object.prototype.hasOwnProperty.call(GROUP_BY, value);
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const groupBy = url.searchParams.get("groupBy") ?? "pillar";
    if (!isGroupBy(groupBy)) {
      return jsonError(
        400,
        `Unknown groupBy '${groupBy}'. Expected one of: ${Object.keys(GROUP_BY).join(", ")}`,
      );
    }

    const dim = GROUP_BY[groupBy];
    const db = getServiceDb();

    const rows = await db.query<{
      key: string | null;
      total_cents: string;
      event_count: string;
    }>(
      `select ${dim.label} as key,
              coalesce(sum(e.amount_cents), 0)::text as total_cents,
              count(*)::text as event_count
         from revenue_attribution_events e
         ${dim.join}
        group by ${dim.label}
        order by coalesce(sum(e.amount_cents), 0) desc`,
    );

    const slices = rows.map((r) => ({
      key: r.key ?? "(unattributed)",
      total_cents: Number(r.total_cents),
      event_count: Number(r.event_count),
    }));
    const totalCents = slices.reduce((sum, s) => sum + s.total_cents, 0);

    // Payout liability (unpaid = pending + approved), integer cents.
    const payoutRows = await db.query<{ status: string; total_cents: string }>(
      `select status, coalesce(sum(amount_cents), 0)::text as total_cents
         from payouts group by status`,
    );
    const byStatus: Record<string, number> = {};
    let liabilityCents = 0;
    for (const p of payoutRows) {
      const cents = Number(p.total_cents);
      byStatus[p.status] = cents;
      if (p.status === "pending" || p.status === "approved") {
        liabilityCents += cents;
      }
    }

    return NextResponse.json({
      groupBy,
      total_cents: totalCents,
      slices,
      payout_liability: {
        by_status: byStatus,
        unpaid_cents: liabilityCents,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
