"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { dateTime } from "./format";
import {
  listDueDiligence,
  type DueDiligenceReview,
} from "@/lib/api/admin/partners";

type LoadState = "loading" | "ready" | "error";

function outcomeTone(outcome: string | null): AdminBadgeTone {
  switch (outcome) {
    case "passed":
    case "approved":
    case "cleared":
      return "green";
    case "flagged":
    case "conditional":
      return "amber";
    case "failed":
    case "rejected":
      return "red";
    default:
      return "slate";
  }
}

function checklistSummary(checklist: unknown): string {
  if (!checklist || typeof checklist !== "object") return "—";
  const entries = Object.entries(checklist as Record<string, unknown>);
  if (entries.length === 0) return "—";
  const done = entries.filter(([, v]) => v === true || v === "pass").length;
  return `${done}/${entries.length} checks`;
}

/**
 * <DueDiligenceView> — partner due-diligence reviews (Task 20). Read-only
 * viewer of the compliance checks recorded per partner before activation.
 */
export function DueDiligenceView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<DueDiligenceReview[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listDueDiligence({});
      setRows(res.reviews);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<DueDiligenceReview>[] = [
    {
      key: "partner",
      header: "Partner",
      cell: (r) => (
        <span className="font-semibold text-admin-ink">
          {r.partner_name ?? r.partner_id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      cell: (r) => (
        <AdminBadge tone={outcomeTone(r.outcome)}>
          {r.outcome ?? "pending"}
        </AdminBadge>
      ),
    },
    {
      key: "checklist",
      header: "Checklist",
      cell: (r) => (
        <span className="text-[11.5px] text-admin-ink-2">
          {checklistSummary(r.checklist)}
        </span>
      ),
    },
    {
      key: "notes",
      header: "Notes",
      cell: (r) => (
        <span className="text-[11.5px] text-admin-ink-2">
          {r.notes ?? "—"}
        </span>
      ),
    },
    {
      key: "reviewed",
      header: "Reviewed",
      align: "right",
      cell: (r) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(r.reviewed_at ?? r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-due-diligence">
      <AdminPageHeader
        eyebrow="Governance · Marketplace"
        title="Due diligence"
        sub="Partner compliance reviews recorded before activation"
      />
      <DataTable
        testId="due-diligence-table"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No due-diligence reviews recorded."
      />
    </div>
  );
}
