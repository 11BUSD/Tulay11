"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge, partnerStatusTone } from "./AdminBadge";
import { LicensingBadge } from "./LicensingBadge";
import { DataTable, type Column } from "./DataTable";
import { FilterBar, FilterPill } from "./FilterBar";
import { MaskedField } from "./MaskedField";
import {
  listPartners,
  updatePartner,
  type Partner,
  type PartnerStatus,
} from "@/lib/api/admin/partners";

type LoadState = "loading" | "ready" | "error";

const STATUS_FILTERS: Array<{ value: PartnerStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "in_review", label: "In review" },
  { value: "prospect", label: "Prospect" },
  { value: "paused", label: "Paused" },
];

/**
 * <PartnersView> — the partner directory list (Task 19). Loads partners from
 * `GET /api/partners`, supports status filtering, and offers inline
 * activate/pause actions (PATCH /api/partners/[id]). Contact email is masked
 * (AC7).
 */
export function PartnersView() {
  const [state, setState] = useState<LoadState>("loading");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [status, setStatus] = useState<PartnerStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(next: PartnerStatus | "all" = status) {
    setState("loading");
    try {
      const res = await listPartners(
        next === "all" ? {} : { status: next },
      );
      setPartners(res.partners);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setPartnerStatus(id: string, nextStatus: PartnerStatus) {
    setBusyId(id);
    try {
      const res = await updatePartner(id, { status: nextStatus });
      setPartners((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...res.partner } : p)),
      );
    } catch {
      // Surface nothing destructive; a full reload keeps the table consistent.
      void load(status);
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<Partner>[] = [
    {
      key: "name",
      header: "Partner",
      cell: (p) => (
        <div>
          <Link
            href={`/admin/partners/${p.id}`}
            className="font-semibold text-admin-ink hover:text-admin"
          >
            {p.name}
          </Link>
          <div className="text-[11px] text-admin-ink-3">
            {p.website ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (p) => p.category ?? "—",
    },
    {
      key: "contact",
      header: "Contact",
      cell: (p) => <MaskedField value={p.contact_email} kind="email" />,
    },
    {
      key: "status",
      header: "Status",
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
      header: "Actions",
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-1.5">
          {p.status === "active" ? (
            <AdminButton
              sm
              variant="default"
              disabled={busyId === p.id}
              data-action="pause"
              onClick={() => void setPartnerStatus(p.id, "paused")}
            >
              Pause
            </AdminButton>
          ) : (
            <AdminButton
              sm
              variant="ok"
              disabled={busyId === p.id}
              data-action="activate"
              onClick={() => void setPartnerStatus(p.id, "active")}
            >
              Activate
            </AdminButton>
          )}
          <Link href={`/admin/partners/${p.id}`}>
            <AdminButton sm variant="ghost">
              Open
            </AdminButton>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div data-component-id="admin-partners">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Partners"
        sub={`${partners.length} organizations`}
        actions={
          <Link href="/admin/partners/new">
            <AdminButton variant="primary">Add partner</AdminButton>
          </Link>
        }
      />
      <FilterBar>
        {STATUS_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            active={status === f.value}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </FilterPill>
        ))}
      </FilterBar>
      <DataTable
        testId="partners-table"
        columns={columns}
        rows={partners}
        rowKey={(p) => p.id}
        state={state}
        onRetry={() => void load(status)}
        emptyLabel="No partners match this filter."
      />
    </div>
  );
}
