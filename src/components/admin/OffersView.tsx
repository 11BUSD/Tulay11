"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { FilterBar, FilterPill } from "./FilterBar";
import { money } from "./format";
import { listOffers, type AdminOffer } from "@/lib/api/admin/offers";

type LoadState = "loading" | "ready" | "error";

const ACTIVE_FILTERS: Array<{ value: "all" | "true" | "false"; label: string }> =
  [
    { value: "all", label: "All" },
    { value: "true", label: "Active" },
    { value: "false", label: "Paused" },
  ];

/**
 * <OffersView> — the offers list (Task 19). Loads offers from `GET /api/offers`
 * sorted by priority score, supports active/paused filtering, shows
 * commission/reward as money (bigint cents coerced), and links each row to the
 * offer editor.
 */
export function OffersView() {
  const [state, setState] = useState<LoadState>("loading");
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [active, setActive] = useState<"all" | "true" | "false">("all");

  async function load(next: "all" | "true" | "false" = active) {
    setState("loading");
    try {
      const res = await listOffers(
        next === "all" ? {} : { active: next === "true" },
      );
      setOffers(res.offers);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const columns: Column<AdminOffer>[] = [
    {
      key: "title",
      header: "Offer",
      cell: (o) => (
        <Link
          href={`/admin/offers/${o.id}`}
          className="font-semibold text-admin-ink hover:text-admin"
        >
          {o.title}
        </Link>
      ),
    },
    {
      key: "pillar",
      header: "Pillar",
      cell: (o) =>
        o.settlement_pillar ? (
          <AdminBadge tone="slate">{o.settlement_pillar}</AdminBadge>
        ) : (
          "—"
        ),
    },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      cell: (o) =>
        o.commission_type === "percentage"
          ? `${Number(o.commission_value_cents) / 100}%`
          : money(o.commission_value_cents),
    },
    {
      key: "reward",
      header: "User reward",
      align: "right",
      cell: (o) => money(o.user_reward_value_cents),
    },
    {
      key: "priority",
      header: "Priority",
      align: "right",
      cell: (o) => o.priority_score,
    },
    {
      key: "status",
      header: "Active",
      cell: (o) =>
        o.active ? (
          <AdminBadge tone="green">Active</AdminBadge>
        ) : (
          <AdminBadge tone="slate">Paused</AdminBadge>
        ),
    },
  ];

  return (
    <div data-component-id="admin-offers">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Offers"
        sub={`${offers.length} offers · sorted by priority score`}
        actions={
          <Link href="/admin/offers/new">
            <AdminButton variant="primary">New offer</AdminButton>
          </Link>
        }
      />
      <FilterBar>
        {ACTIVE_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            active={active === f.value}
            onClick={() => setActive(f.value)}
          >
            {f.label}
          </FilterPill>
        ))}
      </FilterBar>
      <DataTable
        testId="offers-table"
        columns={columns}
        rows={offers}
        rowKey={(o) => o.id}
        state={state}
        onRetry={() => void load(active)}
        emptyLabel="No offers match this filter."
      />
      <p className="mt-3 text-[11px] text-admin-ink-3">
        Commission values stored as integer cents; percent types store basis
        points. All money rendered to $ for display only.
      </p>
    </div>
  );
}
