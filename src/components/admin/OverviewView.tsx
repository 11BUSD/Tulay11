"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { MetricCard } from "./MetricCard";
import { RevenueChart } from "./RevenueChart";
import { money, count } from "./format";
import { getRevenue, type RevenueResponse } from "@/lib/api/admin/revenue";
import { listOutreachMessages } from "@/lib/api/admin/outreach";

type LoadState = "loading" | "ready" | "error";

/**
 * <OverviewView> — the admin operator home. Loads revenue-by-pillar +
 * payout-liability from `GET /api/admin/revenue` and the count of drafts
 * awaiting approval, then renders KPI tiles, a revenue-by-pillar chart, and the
 * governance banner (which links the outreach approval queue + audit log).
 */
export function OverviewView() {
  const [state, setState] = useState<LoadState>("loading");
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [awaiting, setAwaiting] = useState(0);

  async function load() {
    setState("loading");
    try {
      const [rev, queue] = await Promise.all([
        getRevenue("pillar"),
        listOutreachMessages({ state: "drafted" }),
      ]);
      setRevenue(rev);
      setAwaiting(queue.messages.length);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div data-component-id="admin-overview">
      <AdminPageHeader
        eyebrow="Revenue operating system"
        title="Overview"
        sub="Ontario newcomer settlement · all pillars"
      />

      {state === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-admin-red-bg bg-admin-red-bg p-4 text-admin-red"
        >
          Could not load overview data.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {state !== "error" ? (
        <>
          <div
            data-component-id="metric-cards"
            className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            <MetricCard
              testId="metric-total-revenue"
              label="Attributed revenue"
              value={
                state === "loading" ? "—" : money(revenue?.total_cents ?? 0)
              }
              foot={
                revenue
                  ? `${count(revenue.total_cents)} cents · gross`
                  : "integer cents"
              }
            />
            <MetricCard
              testId="metric-payout-liability"
              label="Payout liability (unpaid)"
              value={
                state === "loading"
                  ? "—"
                  : money(revenue?.payout_liability.unpaid_cents ?? 0)
              }
              foot="approved + pending"
            />
            <MetricCard
              testId="metric-revenue-slices"
              label="Revenue pillars"
              value={state === "loading" ? "—" : count(revenue?.slices.length ?? 0)}
              foot="dimensions with revenue"
            />
            <MetricCard
              testId="metric-awaiting-approval"
              label="Awaiting approval"
              value={state === "loading" ? "—" : count(awaiting)}
              foot={
                <Link
                  href="/admin/outreach/approvals"
                  className="text-admin-teal underline"
                >
                  outreach queue
                </Link>
              }
            />
          </div>

          <div className="mb-4">
            <RevenueChart
              title="Revenue by settlement pillar"
              slices={revenue?.slices ?? []}
              state={state}
            />
          </div>

          <div
            data-component-id="governance-banner"
            className="rounded-lg border border-[#ead3b0] bg-gradient-to-b from-admin-amber-bg to-[#fbf5ec] p-3.5 text-[12.5px] leading-relaxed text-[#6b4310]"
          >
            <b>Governance:</b> All outbound partner outreach is agent-drafted and
            requires human approval before sending.{" "}
            <b>{count(awaiting)} messages</b> are waiting in the{" "}
            <Link
              href="/admin/outreach/approvals"
              className="font-bold text-[#8a3b04] underline"
            >
              outreach approval queue
            </Link>
            . Money and outreach events are written to an append-only{" "}
            <Link
              href="/admin/audit-logs"
              className="font-bold text-[#8a3b04] underline"
            >
              audit log
            </Link>
            .
          </div>
        </>
      ) : null}
    </div>
  );
}
