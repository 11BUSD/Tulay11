"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { createPartner } from "@/lib/api/admin/partners";

/**
 * <PartnerForm> — create a new partner (Task 19). Minimal zod-backed create
 * form matching `partner-detail`/`partners-list` copy; on success routes to the
 * new partner's detail page. Licensed partners are created as `prospect` and
 * must clear licensing/DD before activation (enforced server-side).
 */
export function PartnerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [licensed, setLicensed] = useState(false);
  const [filipino, setFilipino] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await createPartner({
        name: name.trim(),
        category: category || null,
        website: website || null,
        contact_email: email || null,
        licensed_required: licensed,
        filipino_focus: filipino,
        newcomer_focus: true,
        ontario_focus: true,
      });
      router.push(`/admin/partners/${res.partner.id}`);
    } catch {
      setError("Could not create partner. Check the fields and try again.");
      setBusy(false);
    }
  }

  return (
    <div data-component-id="partner-form">
      <AdminPageHeader eyebrow="Marketplace · Partner" title="New partner" />
      {error ? (
        <p role="alert" className="mb-3 text-[12.5px] text-admin-red">
          {error}
        </p>
      ) : null}
      <div className="max-w-xl rounded-lg border border-admin-border bg-admin-surface p-5 shadow-sm">
        <FormField label="Name">
          <input
            className="admin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
          />
        </FormField>
        <FormField label="Category">
          <input
            className="admin-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          />
        </FormField>
        <FormField label="Website">
          <input
            className="admin-input"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            aria-label="Website"
          />
        </FormField>
        <FormField label="Contact email">
          <input
            className="admin-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Contact email"
          />
        </FormField>
        <label className="mb-2 flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={licensed}
            onChange={(e) => setLicensed(e.target.checked)}
          />
          License required (regulated category)
        </label>
        <label className="mb-4 flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={filipino}
            onChange={(e) => setFilipino(e.target.checked)}
          />
          Filipino community focus
        </label>
        <div className="flex gap-2">
          <AdminButton
            variant="primary"
            disabled={busy}
            data-action="create-partner"
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Create partner"}
          </AdminButton>
          <AdminButton variant="ghost" onClick={() => router.push("/admin/partners")}>
            Cancel
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

function FormField({
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
