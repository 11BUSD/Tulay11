"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { MaskedField } from "./MaskedField";
import { FilterBar, FilterPill } from "./FilterBar";
import { dateTime } from "./format";
import {
  listConsentRecords,
  type ConsentRecord,
} from "@/lib/api/admin/governance";

type LoadState = "loading" | "ready" | "error";

/**
 * <ConsentRecordsView> — consent ledger (Task 20, AC7). Append-only consent
 * records; by default shows the latest record per (subject, purpose), with a
 * toggle to show the full history. Subject identifiers are hashed and rendered
 * masked (raw email/IP never exposed).
 */
export function ConsentRecordsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<ConsentRecord[]>([]);
  const [showAll, setShowAll] = useState(false);

  async function load(all: boolean) {
    setState("loading");
    try {
      const res = await listConsentRecords(all ? { all: true } : {});
      setRows(res.records);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load(showAll);
  }, [showAll]);

  const columns: Column<ConsentRecord>[] = [
    {
      key: "subject",
      header: "Subject",
      cell: (r) => (
        <MaskedField
          value={r.subject_email_hash ?? r.subject_id}
          kind={r.subject_email_hash ? "hash" : "generic"}
        />
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      cell: (r) => (
        <span className="text-[11.5px] font-semibold text-admin-ink">
          {r.purpose}
        </span>
      ),
    },
    {
      key: "granted",
      header: "Consent",
      cell: (r) => (
        <AdminBadge tone={r.granted ? "green" : "red"}>
          {r.granted ? "granted" : "withdrawn"}
        </AdminBadge>
      ),
    },
    {
      key: "basis",
      header: "Basis",
      cell: (r) => (
        <span className="text-[11.5px] text-admin-ink-2">{r.basis ?? "—"}</span>
      ),
    },
    {
      key: "categories",
      header: "Data categories",
      cell: (r) => (
        <span className="text-[11px] text-admin-ink-3">
          {r.data_categories?.length ? r.data_categories.join(", ") : "—"}
        </span>
      ),
    },
    {
      key: "version",
      header: "Text version",
      cell: (r) => (
        <span className="font-mono text-[11px] text-admin-ink-3">
          {r.consent_text_version ?? "—"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Recorded",
      align: "right",
      cell: (r) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-consent-records">
      <AdminPageHeader
        eyebrow="Governance"
        title="Consent records"
        sub="Append-only consent ledger · subject identifiers hashed (AC7)"
      />
      <FilterBar>
        <FilterPill active={!showAll} onClick={() => setShowAll(false)}>
          Latest per subject
        </FilterPill>
        <FilterPill active={showAll} onClick={() => setShowAll(true)}>
          Full history
        </FilterPill>
      </FilterBar>
      <DataTable
        testId="consent-records-table"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        state={state}
        onRetry={() => void load(showAll)}
        emptyLabel="No consent records."
      />
    </div>
  );
}
