"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge, payoutStatusTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { MetricCard } from "./MetricCard";
import { money, count } from "./format";
import {
  listPayouts,
  updatePayoutStatus,
  type Payout,
  type PayoutSummary,
} from "@/lib/api/admin/payouts";

type LoadState = "loading" | "ready" | "error";

/**
 * <PayoutsView> — the payouts ledger (Task 19) per `payouts-ledger.html`.
 * Loads payouts + a liability summary, shows approve/reject actions on
 * pending/approved rows, and renders PAID rows as immutable (actions disabled,
 * and a 409 from the server is surfaced as a per-row note rather than a crash).
 */
export function PayoutsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function load() {
    setState("loading");
    try {
      const res = await listPayouts();
      setPayouts(res.payouts);
      setSummary(res.summary);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, next: "approved" | "rejected") {
    setBusyId(id);
    setRowError((prev) => {
      const { [id]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });
    try {
      const res = await updatePayoutStatus(id, next);
      setPayouts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...res.payout } : p)),
      );
    } catch (err) {
      // A PAID payout is immutable → server returns 409; surface it gracefully.
      const msg =
        err && typeof err === "object" && "status" in err && err.status === 409
          ? "Payout is paid and immutable."
          : "Action failed.";
      setRowError((prev) => ({ ...prev, [id]: msg }));
    } finally {
      setBusyId(null);
    }
  }

  const byStatus = summary?.by_status ?? {};

  const columns: Column<Payout>[] = [
    {
      key: "id",
      header: "Payout",
      cell: (p) => (
        <div>
          <div className="font-mono text-[11.5px] font-semibold text-admin-ink">
            {p.id.slice(0, 8)}
          </div>
          <div className="text-[11px] text-admin-ink-3">{p.payee_type}</div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (p) => (
        <span className="font-mono font-semibold">{money(p.amount_cents)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => (
        <AdminBadge tone={payoutStatusTone(p.status)}>{p.status}</AdminBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (p) => {
        if (p.status === "paid") {
          return (
            <span
              data-action="immutable"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-green"
            >
              Immutable
            </span>
          );
        }
        if (p.status === "rejected") {
          return <span className="text-[11px] text-admin-ink-3">—</span>;
        }
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex justify-end gap-1.5">
              {p.status === "pending" ? (
                <AdminButton
                  sm
                  variant="ok"
                  disabled={busyId === p.id}
                  data-action="approve"
                  onClick={() => void decide(p.id, "approved")}
                >
                  Approve
                </AdminButton>
              ) : null}
              <AdminButton
                sm
                variant="danger"
                disabled={busyId === p.id}
                data-action="reject"
                onClick={() => void decide(p.id, "rejected")}
              >
                Reject
              </AdminButton>
            </div>
            {rowError[p.id] ? (
              <span role="alert" className="text-[10.5px] text-admin-red">
                {rowError[p.id]}
              </span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div data-component-id="admin-payouts">
      <AdminPageHeader
        eyebrow="Marketplace · Finance"
        title="Payouts ledger"
        sub="Ambassador & partner payouts"
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          testId="payout-pending"
          label="Pending review"
          value={money(byStatus.pending?.total_cents ?? 0)}
          foot={`${count(byStatus.pending?.count ?? 0)} items`}
        />
        <MetricCard
          testId="payout-approved"
          label="Approved (unpaid)"
          value={money(byStatus.approved?.total_cents ?? 0)}
          foot={`${count(byStatus.approved?.count ?? 0)} items`}
        />
        <MetricCard
          testId="payout-paid"
          label="Paid"
          value={money(byStatus.paid?.total_cents ?? 0)}
          foot="immutable"
        />
        <MetricCard
          testId="payout-rejected"
          label="Rejected"
          value={money(byStatus.rejected?.total_cents ?? 0)}
          foot={`${count(byStatus.rejected?.count ?? 0)} items`}
        />
      </div>

      <div
        data-component-id="paid-immutable-notice"
        className="mb-4 rounded-lg border border-[#c4e2cf] bg-admin-green-bg p-3 text-[12px] text-[#155e35]"
      >
        <b>PAID payouts are immutable.</b> Once marked Paid a payout is locked and
        can never be edited, reversed, or deleted here — corrections are made via
        a new offsetting adjustment entry, written to the audit log.
      </div>

      <DataTable
        testId="payouts-table"
        columns={columns}
        rows={payouts}
        rowKey={(p) => p.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No payouts in this period."
      />
    </div>
  );
}
