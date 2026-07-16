"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { dateTime } from "./format";
import { listAgreements, type Agreement } from "@/lib/api/admin/partners";

type LoadState = "loading" | "ready" | "error";

function agreementTone(status: string): AdminBadgeTone {
  switch (status) {
    case "signed":
      return "green";
    case "sent":
      return "amber";
    case "draft":
      return "slate";
    case "expired":
    case "terminated":
      return "red";
    default:
      return "slate";
  }
}

/**
 * <AgreementsView> — partner agreements (Task 20). Read-only viewer of the
 * partner_agreements lifecycle (draft → sent → signed → expired/terminated).
 */
export function AgreementsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<Agreement[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listAgreements({});
      setRows(res.agreements);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<Agreement>[] = [
    {
      key: "partner",
      header: "Partner",
      cell: (a) => (
        <span className="font-semibold text-admin-ink">
          {a.partner_name ?? a.partner_id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <AdminBadge tone={agreementTone(a.status)}>{a.status}</AdminBadge>
      ),
    },
    {
      key: "terms",
      header: "Terms",
      cell: (a) => (
        <span className="text-[11.5px] text-admin-ink-2">
          {a.terms_summary ?? "—"}
        </span>
      ),
    },
    {
      key: "document",
      header: "Document",
      cell: (a) =>
        a.document_url ? (
          <a
            href={a.document_url}
            target="_blank"
            rel="noreferrer"
            className="text-admin-teal underline"
          >
            View
          </a>
        ) : (
          <span className="text-admin-ink-3">—</span>
        ),
    },
    {
      key: "effective",
      header: "Effective",
      align: "right",
      cell: (a) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(a.effective_at)}
        </span>
      ),
    },
    {
      key: "signed",
      header: "Signed",
      align: "right",
      cell: (a) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(a.signed_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-agreements">
      <AdminPageHeader
        eyebrow="Governance · Marketplace"
        title="Partner agreements"
        sub="Agreement lifecycle: draft → sent → signed → expired / terminated"
      />
      <DataTable
        testId="agreements-table"
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No agreements recorded."
      />
    </div>
  );
}
