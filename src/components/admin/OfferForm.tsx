"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import {
  createOffer,
  getOffer,
  updateOffer,
  type AdminOffer,
} from "@/lib/api/admin/offers";
import { listPartners, type Partner } from "@/lib/api/admin/partners";
import { toInt } from "./format";

type Mode = { kind: "new" } | { kind: "edit"; id: string };

const PILLARS = [
  "housing",
  "banking",
  "employment",
  "telecom",
  "legal",
  "health",
];

/**
 * <OfferForm> — create or edit a partner offer (Task 19). Commission value is
 * entered in dollars and stored as integer cents; for percentage types the
 * field is basis points. On save routes back to the offers list. A
 * consumer-facing disclaimer is required for regulated pillars (surfaced as a
 * hint; server enforces the full compliance gate).
 */
export function OfferForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready">(
    mode.kind === "edit" ? "loading" : "ready",
  );
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [pillar, setPillar] = useState("banking");
  const [commissionType, setCommissionType] = useState("fixed");
  const [commissionCents, setCommissionCents] = useState(0);
  const [priority, setPriority] = useState(0);
  const [active, setActive] = useState(false);
  const [complianceNotes, setComplianceNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function init() {
      const [{ partners: ps }, existing] = await Promise.all([
        listPartners(),
        mode.kind === "edit" ? getOffer(mode.id) : Promise.resolve(null),
      ]);
      setPartners(ps);
      if (existing) {
        const o: AdminOffer = existing.offer;
        setPartnerId(o.partner_id);
        setTitle(o.title);
        setPillar(o.settlement_pillar ?? "banking");
        setCommissionType(o.commission_type);
        setCommissionCents(toInt(o.commission_value_cents));
        setPriority(o.priority_score);
        setActive(o.active);
        setComplianceNotes(o.compliance_notes ?? "");
      } else if (ps.length > 0) {
        setPartnerId(ps[0].id);
      }
      setState("ready");
    }
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError(null);
    if (!title.trim() || !partnerId) {
      setError("Title and partner are required.");
      return;
    }
    setBusy(true);
    try {
      if (mode.kind === "edit") {
        await updateOffer(mode.id, {
          title: title.trim(),
          settlement_pillar: pillar,
          commission_type: commissionType,
          commission_value_cents: commissionCents,
          priority_score: priority,
          active,
          compliance_notes: complianceNotes || null,
        });
      } else {
        await createOffer({
          partner_id: partnerId,
          title: title.trim(),
          settlement_pillar: pillar,
          commission_type: commissionType,
          commission_value_cents: commissionCents,
          priority_score: priority,
          active,
          compliance_notes: complianceNotes || undefined,
        });
      }
      router.push("/admin/offers");
    } catch {
      setError("Could not save the offer.");
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="h-40 w-full animate-pulse rounded bg-admin-surface2" data-component-id="offer-form-loading" />
    );
  }

  return (
    <div data-component-id="offer-form">
      <AdminPageHeader
        eyebrow="Marketplace · Offer"
        title={mode.kind === "edit" ? "Edit offer" : "New offer"}
        sub="Draft · not visible to users until active and compliance-approved"
      />
      {error ? (
        <p role="alert" className="mb-3 text-[12.5px] text-admin-red">
          {error}
        </p>
      ) : null}
      <div className="max-w-2xl rounded-lg border border-admin-border bg-admin-surface p-5 shadow-sm">
        <Field label="Offer title">
          <input
            className="admin-input"
            aria-label="Offer title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Partner">
            <select
              className="admin-input"
              aria-label="Partner"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              disabled={mode.kind === "edit"}
            >
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Settlement pillar">
            <select
              className="admin-input"
              aria-label="Settlement pillar"
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
            >
              {PILLARS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Commission type">
            <select
              className="admin-input"
              aria-label="Commission type"
              value={commissionType}
              onChange={(e) => setCommissionType(e.target.value)}
            >
              <option value="fixed">Fixed (CPA)</option>
              <option value="percentage">Percentage (rev-share)</option>
              <option value="recurring">Recurring</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <Field label="Commission value (cents / bps)">
            <input
              className="admin-input font-mono"
              type="number"
              aria-label="Commission value"
              value={commissionCents}
              onChange={(e) => setCommissionCents(Number(e.target.value) || 0)}
            />
          </Field>
        </div>
        <Field label="Compliance notes (internal)">
          <textarea
            className="admin-input"
            aria-label="Compliance notes"
            rows={2}
            value={complianceNotes}
            onChange={(e) => setComplianceNotes(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Priority score (0–100)">
            <input
              className="admin-input"
              type="number"
              aria-label="Priority score"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active (visible in offer feed)
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <AdminButton
            variant="primary"
            disabled={busy}
            data-action="save-offer"
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Save offer"}
          </AdminButton>
          <AdminButton variant="ghost" onClick={() => router.push("/admin/offers")}>
            Cancel
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[12px] font-semibold text-admin-ink">
        {label}
      </label>
      {children}
    </div>
  );
}
