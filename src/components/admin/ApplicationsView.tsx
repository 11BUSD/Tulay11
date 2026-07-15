"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge, partnerStatusTone } from "./AdminBadge";
import { LicensingBadge } from "./LicensingBadge";
import { DataTable, type Column } from "./DataTable";
import { MaskedField } from "./MaskedField";
import {
  listPartners,
  updatePartner,
  type Partner,
} from "@/lib/api/admin/partners";

type LoadState = "loading" | "ready" | "error";

/** Statuses that represent a partner application awaiting a decision. */
const PENDING_STATUSES: Partner["status"][] = [
  "prospect",
  "contacted",
  "in_review",
];

/**
 * <ApplicationsView> — partner applications review (Task 19). Loads partners in
 * the pending pipeline (prospect/contacted/in_review) and lets an admin
 * approve (→ active) or reject (→ rejected) each one via
 * PATCH /api/partners/[id]. A licensed partner cannot be approved until its
 * licence is verified — that action is disabled with a hint.
 */
export function ApplicationsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<Partner[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setState("loading");
    try {
      // Fetch the pending statuses and merge (the list route filters by one
      // status at a time).
      const results = await Promise.all(
        PENDING_STATUSES.map((s) => listPartners({ status: s })),
      );
      const merged = results.flatMap((r) => r.partners);
      setRows(merged);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, next: Partner["status"]) {
    setBusyId(id);
    try {
      await updatePartner(id, { status: next });
      // Once decided the partner leaves the pending pipeline.
      setRows((prev) => prev.filter((p) => p.id !== id));
    } catch {
      void load();
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Partner>[] = [
    {
      key: "name",
      header: "Applicant",
      cell: (p) => (
        <div>
          <Link
            href={`/admin/partners/${p.id}`}
            className="font-semibold text-admin-ink hover:text-admin"
          >
            {p.name}
          </Link>
          <div className="text-[11px] text-admin-ink-3">{p.category ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (p) => <MaskedField value={p.contact_email} kind="email" />,
    },
    {
      key: "status",
      header: "Stage",
      cell: (p) => (
        <AdminBadge tone={partnerStatusTone(p.status)}>
          {p.status.replace("_", " ")}
        </AdminBadge>
      ),
    },
    {
      key: "licensing",
      header: "Licensing",
      cell: (p) => (
        <LicensingBadge
          licensedRequired={p.licensed_required}
          licenseVerifiedAt={p.license_verified_at}
        />
      ),
    },
    {
      key: "actions",
      header: "Decision",
      align: "right",
      cell: (p) => {
        const blocked = p.licensed_required && !p.license_verified_at;
        return (
          <div className="flex justify-end gap-1.5">
            <AdminButton
              sm
              variant="ok"
              disabled={busyId === p.id || blocked}
              title={blocked ? "Verify licence before approving" : undefined}
              data-action="approve"
              onClick={() => void decide(p.id, "active")}
            >
              Approve
            </AdminButton>
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
        );
      },
    },
  ];

  return (
    <div data-component-id="admin-applications">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Partner applications"
        sub={`${rows.length} awaiting a decision`}
      />
      <DataTable
        testId="applications-table"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No applications awaiting review."
      />
    </div>
  );
}
