"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { MetricCard } from "./MetricCard";
import { money, count } from "./format";
import { getAnalytics, type AnalyticsResponse } from "@/lib/api/admin/analytics";

type LoadState = "loading" | "ready" | "error";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * <AnalyticsView> — the product-analytics operator dashboard. Loads the single
 * metrics payload from `GET /api/admin/analytics` and renders KPI tiles, the
 * pillar funnel, revenue-by-partner, and ambassador performance. Money is
 * integer cents (coerced + formatted via the admin `money` helper). Estimated
 * metrics (impressions/CAC/LTV) are labelled as such.
 */
export function AnalyticsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  async function load() {
    setState("loading");
    try {
      setData(await getAnalytics());
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const loading = state === "loading";

  return (
    <div data-component-id="admin-analytics">
      <AdminPageHeader
        eyebrow="Product analytics"
        title="Analytics"
        sub="Activation, funnel, revenue and unit economics"
      />

      {state === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-admin-red-bg bg-admin-red-bg p-4 text-admin-red"
        >
          Could not load analytics.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              testId="metric-users"
              label="Users"
              value={loading ? "—" : count(data?.users ?? 0)}
              foot={
                loading ? "" : `${count(data?.activated_users ?? 0)} activated`
              }
            />
            <MetricCard
              testId="metric-activation"
              label="Activation rate"
              value={loading ? "—" : pct(data?.activation_rate ?? 0)}
              foot="users with any activity"
            />
            <MetricCard
              testId="metric-conversion"
              label="Conversion rate"
              value={loading ? "—" : pct(data?.conversion_rate ?? 0)}
              foot={
                loading
                  ? ""
                  : `${count(data?.conversions ?? 0)} / ${count(data?.clicks ?? 0)} clicks`
              }
            />
            <MetricCard
              testId="metric-revenue"
              label="Attributed revenue"
              value={loading ? "—" : money(data?.revenue_cents ?? 0)}
              foot={
                loading
                  ? ""
                  : `${money(data?.revenue_per_user_cents ?? 0)} / user`
              }
            />
            <MetricCard
              testId="metric-payout-liability"
              label="Payout liability"
              value={loading ? "—" : money(data?.payout_liability_cents ?? 0)}
              foot="unpaid (pending + approved)"
            />
            <MetricCard
              testId="metric-cac"
              label="CAC (est.)"
              value={loading ? "—" : money(data?.cac_cents ?? 0)}
              foot="assumed blended cost"
            />
            <MetricCard
              testId="metric-ltv"
              label="LTV (est.)"
              value={loading ? "—" : money(data?.ltv_cents ?? 0)}
              foot="revenue-per-user proxy"
            />
            <MetricCard
              testId="metric-ltv-cac"
              label="LTV : CAC (est.)"
              value={loading ? "—" : `${(data?.ltv_to_cac ?? 0).toFixed(2)}×`}
              foot="unit economics"
            />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section
              data-component-id="pillar-funnel"
              className="rounded-lg border border-admin-border bg-admin-surface shadow-sm"
            >
              <h3 className="border-b border-admin-border px-4 py-3.5 text-[13.5px] font-bold text-admin-ink">
                Pillar funnel (starts → completions)
              </h3>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-admin-ink-3">
                    <th className="px-4 py-2 font-semibold">Pillar</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Starts
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Completions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.pillar_funnel ?? []).map((row) => (
                    <tr key={row.pillar} className="border-t border-admin-border">
                      <td className="px-4 py-2 text-admin-ink">{row.pillar}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {count(row.starts)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {count(row.completions)}
                      </td>
                    </tr>
                  ))}
                  {!loading && (data?.pillar_funnel.length ?? 0) === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-admin-ink-3"
                      >
                        No funnel activity yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>

            <section
              data-component-id="revenue-by-partner"
              className="rounded-lg border border-admin-border bg-admin-surface shadow-sm"
            >
              <h3 className="border-b border-admin-border px-4 py-3.5 text-[13.5px] font-bold text-admin-ink">
                Revenue by partner
              </h3>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-admin-ink-3">
                    <th className="px-4 py-2 font-semibold">Partner</th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.revenue_by_partner ?? []).map((row) => (
                    <tr
                      key={row.partner}
                      className="border-t border-admin-border"
                    >
                      <td className="px-4 py-2 text-admin-ink">
                        {row.partner}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(row.revenue_cents)}
                      </td>
                    </tr>
                  ))}
                  {!loading && (data?.revenue_by_partner.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-admin-ink-3">
                        No attributed revenue yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </div>

          <section
            data-component-id="ambassador-performance"
            className="rounded-lg border border-admin-border bg-admin-surface shadow-sm"
          >
            <h3 className="border-b border-admin-border px-4 py-3.5 text-[13.5px] font-bold text-admin-ink">
              Ambassador performance
            </h3>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-admin-ink-3">
                  <th className="px-4 py-2 font-semibold">Ambassador</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    Referrals
                  </th>
                  <th className="px-4 py-2 text-right font-semibold">
                    Attributed
                  </th>
                  <th className="px-4 py-2 text-right font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ambassadors ?? []).map((row) => (
                  <tr
                    key={row.ambassador}
                    className="border-t border-admin-border"
                  >
                    <td className="px-4 py-2 text-admin-ink">
                      {row.ambassador}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {count(row.referrals)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(row.attributed_cents)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(row.paid_cents)}
                    </td>
                  </tr>
                ))}
                {!loading && (data?.ambassadors.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-admin-ink-3">
                      No ambassadors yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <p className="mt-3 text-[11px] text-admin-ink-3">
            Estimated metrics (impressions, CAC, LTV) use stub formulas until
            ad-spend and retention data are captured.
          </p>
        </>
      )}
    </div>
  );
}
