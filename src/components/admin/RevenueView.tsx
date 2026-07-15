"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { MetricCard } from "./MetricCard";
import { RevenueChart } from "./RevenueChart";
import { FilterBar, FilterPill } from "./FilterBar";
import { money, count } from "./format";
import {
  getRevenue,
  REVENUE_DIMENSIONS,
  type RevenueDimension,
  type RevenueResponse,
} from "@/lib/api/admin/revenue";

type LoadState = "loading" | "ready" | "error";

/** Human labels for each of the six revenue dimensions (AC9). */
const DIMENSION_LABELS: Record<RevenueDimension, string> = {
  pillar: "Pillar",
  partner: "Partner",
  offer: "Offer",
  channel: "Channel",
  ambassador: "Ambassador",
  cohort: "Cohort (month)",
};

/**
 * <RevenueView> (Task 21, AC9) — revenue analytics with a filter that slices
 * attributed revenue across all six dimensions (pillar / partner / offer /
 * channel / ambassador / cohort). Switching a filter re-issues
 * `GET /api/admin/revenue?groupBy=<dimension>` with the correct param. Also
 * surfaces the payout-liability view (unpaid + by-status) alongside the chart.
 * All money is integer cents formatted to $.
 */
export function RevenueView() {
  const [groupBy, setGroupBy] = useState<RevenueDimension>("pillar");
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<RevenueResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getRevenue(groupBy)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [groupBy]);

  const byStatus = data?.payout_liability.by_status ?? {};

  return (
    <div data-component-id="admin-revenue">
      <AdminPageHeader
        eyebrow="Revenue operating system"
        title="Revenue analytics"
        sub="Attributed revenue, sliceable across six dimensions · integer cents"
      />

      <FilterBar>
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3">
          Group by
        </span>
        {REVENUE_DIMENSIONS.map((dim) => (
          <FilterPill
            key={dim}
            active={groupBy === dim}
            onClick={() => setGroupBy(dim)}
          >
            <span data-dimension={dim}>{DIMENSION_LABELS[dim]}</span>
          </FilterPill>
        ))}
      </FilterBar>

      {state === "error" ? (
        <div
          role="alert"
          data-component-id="revenue-error"
          className="rounded-lg border border-admin-red-bg bg-admin-red-bg p-4 text-admin-red"
        >
          Could not load revenue data.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setGroupBy((g) => g)}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div
            data-component-id="revenue-metrics"
            className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            <MetricCard
              testId="revenue-total"
              label="Attributed revenue"
              value={state === "loading" ? "—" : money(data?.total_cents ?? 0)}
              foot="gross · integer cents"
            />
            <MetricCard
              testId="revenue-slice-count"
              label={`${DIMENSION_LABELS[groupBy]} slices`}
              value={state === "loading" ? "—" : count(data?.slices.length ?? 0)}
              foot="with revenue"
            />
            <MetricCard
              testId="revenue-unpaid-liability"
              label="Payout liability (unpaid)"
              value={
                state === "loading"
                  ? "—"
                  : money(data?.payout_liability.unpaid_cents ?? 0)
              }
              foot="pending + approved"
            />
            <MetricCard
              testId="revenue-paid"
              label="Paid out"
              value={state === "loading" ? "—" : money(byStatus.paid ?? 0)}
              foot="immutable"
            />
          </div>

          <div className="mb-4">
            <RevenueChart
              title={`Revenue by ${DIMENSION_LABELS[groupBy].toLowerCase()}`}
              slices={data?.slices ?? []}
              state={state}
            />
          </div>

          <div
            data-component-id="payout-liability"
            className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-sm"
          >
            <h3 className="mb-3 text-[13.5px] font-bold text-admin-ink">
              Payout liability by status
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["pending", "approved", "paid", "rejected"] as const).map(
                (status) => (
                  <div
                    key={status}
                    data-component-id={`liability-${status}`}
                    className="rounded-lg border border-admin-border bg-admin-surface2 px-3 py-2.5"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3">
                      {status}
                    </div>
                    <div className="mt-1 font-mono text-[15px] font-semibold text-admin-ink">
                      {state === "loading" ? "—" : money(byStatus[status] ?? 0)}
                    </div>
                  </div>
                ),
              )}
            </div>
            <p className="mt-3 text-[11px] text-admin-ink-3">
              Unpaid liability (pending + approved) is what Tulay still owes
              partners and ambassadors. Paid amounts are immutable.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
