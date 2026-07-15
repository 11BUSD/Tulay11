"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { MaskedField } from "./MaskedField";
import { money, count } from "./format";
import {
  listAmbassadors,
  updateAmbassadorStatus,
  type Ambassador,
} from "@/lib/api/admin/ambassadors";

type LoadState = "loading" | "ready" | "error";

/**
 * <AmbassadorsView> — ambassadors list (Task 19) with referral rollups and
 * activate/suspend actions (PATCH /api/admin/ambassadors/[id]). Email masked
 * (AC7); attributed amount rendered from bigint cents.
 */
export function AmbassadorsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<Ambassador[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      const res = await listAmbassadors();
      setRows(res.ambassadors);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(id: string, next: Ambassador["status"]) {
    setBusyId(id);
    try {
      const res = await updateAmbassadorStatus(id, next);
      setRows((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...res.ambassador } : a)),
      );
    } catch {
      void load();
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Ambassador>[] = [
    {
      key: "name",
      header: "Ambassador",
      cell: (a) => (
        <div>
          <div className="font-semibold text-admin-ink">{a.name}</div>
          <div className="text-[11px] text-admin-ink-3">
            <MaskedField value={a.email} kind="email" />
          </div>
        </div>
      ),
    },
    { key: "code", header: "Referral code", cell: (a) => a.referral_code },
    {
      key: "referrals",
      header: "Referrals",
      align: "right",
      cell: (a) => count(a.referral_count),
    },
    {
      key: "attributed",
      header: "Attributed",
      align: "right",
      cell: (a) => money(a.attributed_cents),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <AdminBadge
          tone={
            a.status === "active"
              ? "green"
              : a.status === "paused"
                ? "amber"
                : "slate"
          }
        >
          {a.status}
        </AdminBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (a) => (
        <div className="flex justify-end gap-1.5">
          {a.status === "active" ? (
            <AdminButton
              sm
              variant="default"
              disabled={busyId === a.id}
              data-action="suspend"
              onClick={() => void setStatus(a.id, "paused")}
            >
              Suspend
            </AdminButton>
          ) : (
            <AdminButton
              sm
              variant="ok"
              disabled={busyId === a.id}
              data-action="activate"
              onClick={() => void setStatus(a.id, "active")}
            >
              Activate
            </AdminButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div data-component-id="admin-ambassadors">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Ambassadors"
        sub={`${rows.length} ambassadors`}
      />
      <DataTable
        testId="ambassadors-table"
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No ambassadors yet."
      />
    </div>
  );
}
