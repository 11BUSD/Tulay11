"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge, partnerStatusTone } from "./AdminBadge";
import { MaskedField } from "./MaskedField";
import {
  getPartner,
  updatePartner,
  listDueDiligence,
  type Partner,
  type DueDiligenceReview,
} from "@/lib/api/admin/partners";

type LoadState = "loading" | "ready" | "error";

/**
 * <PartnerDetailView> — a partner detail with licensing, focus flags, the
 * due-diligence review list, and activate/pause/reject + verify-licence
 * actions. Activation is blocked in the UI when a licensed partner is not yet
 * verified (mirrors the compliance gate). Contact email masked (AC7).
 */
export function PartnerDetailView({ partnerId }: { partnerId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [reviews, setReviews] = useState<DueDiligenceReview[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setState("loading");
    try {
      const [p, dd] = await Promise.all([
        getPartner(partnerId),
        listDueDiligence({ partnerId }),
      ]);
      setPartner(p.partner);
      setReviews(dd.reviews);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  async function transition(next: Partner["status"]) {
    setBusy(true);
    try {
      const res = await updatePartner(partnerId, { status: next });
      setPartner((prev) => (prev ? { ...prev, ...res.partner } : res.partner));
    } catch {
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function verifyLicence() {
    setBusy(true);
    try {
      const res = await updatePartner(partnerId, {
        license_verification: { result: "verified", method: "manual_registry_check" },
      });
      setPartner((prev) => (prev ? { ...prev, ...res.partner } : res.partner));
    } catch {
      void load();
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div data-component-id="partner-detail-loading" className="flex flex-col gap-3">
        <div className="h-8 w-64 animate-pulse rounded bg-admin-surface2" />
        <div className="h-40 w-full animate-pulse rounded bg-admin-surface2" />
      </div>
    );
  }

  if (state === "error" || !partner) {
    return (
      <div role="alert" className="rounded-lg border border-admin-red-bg bg-admin-red-bg p-4 text-admin-red">
        Could not load partner.{" "}
        <button type="button" className="font-semibold underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const licensedBlocked =
    partner.licensed_required && !partner.license_verified_at;

  return (
    <div data-component-id="partner-detail">
      <AdminPageHeader
        eyebrow={
          <>
            <Link href="/admin/partners" className="text-admin-teal">
              Partners
            </Link>
          </>
        }
        title={partner.name}
        sub={
          <span className="flex items-center gap-2">
            <AdminBadge tone={partnerStatusTone(partner.status)}>
              {partner.status.replace("_", " ")}
            </AdminBadge>
            {partner.category ?? "—"} · {partner.location ?? "—"}
          </span>
        }
        actions={
          <>
            {partner.status === "active" ? (
              <AdminButton variant="default" disabled={busy} onClick={() => void transition("paused")}>
                Pause
              </AdminButton>
            ) : (
              <AdminButton
                variant="ok"
                disabled={busy || licensedBlocked}
                data-action="activate"
                onClick={() => void transition("active")}
              >
                Activate partner
              </AdminButton>
            )}
            <AdminButton variant="danger" disabled={busy} onClick={() => void transition("rejected")}>
              Reject
            </AdminButton>
          </>
        }
      />

      {licensedBlocked ? (
        <div
          data-component-id="activation-blocked"
          className="mb-4 rounded-lg border border-[#ead3b0] bg-admin-amber-bg p-3.5 text-[12.5px] text-[#6b4310]"
        >
          <b>Activation blocked.</b> This partner operates in a licensed category
          ({partner.regulator ?? "regulated"}). Licensing must be verified before
          it can go active or have live offers.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-admin-border bg-admin-surface shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-admin-border px-4 py-3.5">
            <h3 className="text-[13.5px] font-bold">Due-diligence review</h3>
            <span className="text-[11px] text-admin-ink-3">
              {reviews.length} record{reviews.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-admin-border" data-component-id="dd-list">
            {reviews.length === 0 ? (
              <li className="px-4 py-6 text-center text-[12.5px] text-admin-ink-3">
                No due-diligence records yet.
              </li>
            ) : (
              reviews.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-[12.5px] font-medium text-admin-ink">
                      {r.notes ?? "Review"}
                    </div>
                    <div className="text-[11px] text-admin-ink-3">
                      {r.reviewed_at ?? r.created_at}
                    </div>
                  </div>
                  <AdminBadge tone={r.outcome === "pass" ? "green" : r.outcome === "fail" ? "red" : "amber"}>
                    {r.outcome ?? "pending"}
                  </AdminBadge>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-sm">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-admin-ink-3">
              Licensing
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-[12.5px]">
              <dt className="text-admin-ink-3">License required</dt>
              <dd>{partner.licensed_required ? "Yes" : "No"}</dd>
              <dt className="text-admin-ink-3">License type</dt>
              <dd>{partner.license_type ?? "—"}</dd>
              <dt className="text-admin-ink-3">License number</dt>
              <dd>{partner.license_number ?? "—"}</dd>
              <dt className="text-admin-ink-3">Regulator</dt>
              <dd>{partner.regulator ?? "—"}</dd>
              <dt className="text-admin-ink-3">Verified at</dt>
              <dd>{partner.license_verified_at ?? "— not verified —"}</dd>
            </dl>
            {partner.licensed_required && !partner.license_verified_at ? (
              <AdminButton
                className="mt-3"
                sm
                variant="primary"
                disabled={busy}
                data-action="verify-licence"
                onClick={() => void verifyLicence()}
              >
                Verify licence
              </AdminButton>
            ) : null}
          </div>

          <div className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-sm">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-admin-ink-3">
              Overview
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-[12.5px]">
              <dt className="text-admin-ink-3">Contact</dt>
              <dd>
                <MaskedField value={partner.contact_email} kind="email" />
              </dd>
              <dt className="text-admin-ink-3">Newcomer focus</dt>
              <dd>{partner.newcomer_focus ? "Yes" : "No"}</dd>
              <dt className="text-admin-ink-3">Filipino focus</dt>
              <dd>{partner.filipino_focus ? "Yes" : "No"}</dd>
              <dt className="text-admin-ink-3">Ontario-based</dt>
              <dd>{partner.ontario_focus ? "Yes" : "No"}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
