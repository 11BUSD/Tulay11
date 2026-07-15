"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { MaskedField } from "./MaskedField";
import { dateTime } from "./format";
import {
  listOutreachContacts,
  type OutreachContact,
} from "@/lib/api/admin/outreach";

type LoadState = "loading" | "ready" | "error";

function consentTone(status: string): AdminBadgeTone {
  switch (status) {
    case "granted":
    case "opted_in":
      return "green";
    case "pending":
      return "amber";
    case "unsubscribed":
    case "opted_out":
    case "revoked":
      return "red";
    default:
      return "slate";
  }
}

/**
 * <OutreachContactsView> — partner outreach contacts (Task 20). PII is
 * minimized (AC7): the raw phone is never returned by the API and email is
 * masked here. Shows consent status/basis so operators respect CASL.
 */
export function OutreachContactsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<OutreachContact[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listOutreachContacts();
      setRows(res.contacts);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<OutreachContact>[] = [
    {
      key: "name",
      header: "Contact",
      cell: (c) => (
        <div>
          <div className="font-semibold text-admin-ink">{c.name ?? "—"}</div>
          <div className="text-[11px] text-admin-ink-3">{c.role ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "partner",
      header: "Partner",
      cell: (c) => c.partner_name ?? "—",
    },
    {
      key: "email",
      header: "Email",
      cell: (c) => <MaskedField value={c.email} kind="email" />,
    },
    {
      key: "source",
      header: "Source",
      cell: (c) => (
        <span className="text-[11.5px] text-admin-ink-2">{c.source ?? "—"}</span>
      ),
    },
    {
      key: "consent",
      header: "Consent",
      cell: (c) => (
        <div className="flex flex-col gap-0.5">
          <AdminBadge tone={consentTone(c.consent_status)}>
            {c.consent_status}
          </AdminBadge>
          {c.consent_basis ? (
            <span className="text-[10.5px] text-admin-ink-3">
              {c.consent_basis}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "created",
      header: "Added",
      align: "right",
      cell: (c) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(c.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-outreach-contacts">
      <AdminPageHeader
        eyebrow="Agent & Outreach"
        title="Outreach contacts"
        sub="Partner-side contacts · phone never surfaced, email masked (AC7)"
      />
      <DataTable
        testId="outreach-contacts-table"
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No outreach contacts yet."
      />
    </div>
  );
}
