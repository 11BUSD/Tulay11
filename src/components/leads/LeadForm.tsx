"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { submitLead } from "@/lib/api/leads";
import {
  buildLeadConsent,
  LEAD_DATA_CATEGORIES,
  leadConsequencesText,
} from "@/lib/consent/schema";
import { ApiError } from "@/lib/api/client";

export interface LeadFormProps {
  pillar: string;
  offerId?: string;
  partnerId?: string;
  /** Named partner the data is shared with (shown in the consent copy). */
  partnerName: string;
  /** Offer title shown as the "Selected" line. */
  offerTitle?: string;
}

/**
 * <LeadForm> — request-an-offer form with a DEFAULT-UNCHECKED consent gate.
 *
 * The submit button is disabled until the explicit consent checkbox is ticked.
 * On submit it builds the FULL consent payload (purpose, dataCategories,
 * sharedWith=named partner, consequencesText, consentTextVersion, basis,
 * granted:true) via `buildLeadConsent` and POSTs to `/api/leads`, which
 * persists the ConsentRecord and rejects if consent is not granted.
 */
export function LeadForm({
  pillar,
  offerId,
  partnerId,
  partnerName,
  offerTitle,
}: LeadFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const consentText = useMemo(
    () => leadConsequencesText(partnerName, LEAD_DATA_CATEGORIES),
    [partnerName],
  );

  const canSubmit =
    consented && name.trim() !== "" && email.trim() !== "" && status !== "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);
    try {
      await submitLead({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        pillar,
        offerId,
        partnerId,
        partnerName,
        consent: buildLeadConsent({ partnerName, granted: consented }),
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ApiError
          ? "We couldn't send your request. Please try again."
          : "Something went wrong. Please try again.",
      );
    }
  }

  if (status === "done") {
    return (
      <div
        data-component-id="lead-success"
        className="rounded-lg border border-line bg-surface p-token-3"
      >
        <h2 className="text-lg font-semibold text-ink">Request sent</h2>
        <p className="mt-2 text-sm text-ink-soft">
          We&apos;ve shared your details with {partnerName}. They&apos;ll be in
          touch about this offer.
        </p>
      </div>
    );
  }

  return (
    <form
      data-component-id="lead-form"
      onSubmit={handleSubmit}
      className="rounded-lg border border-line bg-surface p-token-3"
    >
      <h2 className="text-lg font-semibold text-ink">Request your offer</h2>
      {offerTitle ? (
        <p className="mt-1 text-sm text-ink-soft">
          Selected: <strong className="text-ink">{offerTitle}</strong>
        </p>
      ) : null}

      <div className="mt-token-2 flex flex-col gap-token-2">
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">Full name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Maria Santos"
            autoComplete="name"
            required
          />
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">Email</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@email.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">Phone (optional)</span>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (416) 555-0134"
            autoComplete="tel"
          />
        </label>
        <label className="text-sm text-ink">
          <span className="mb-1 block font-medium">City (optional)</span>
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mississauga"
            autoComplete="address-level2"
          />
        </label>
      </div>

      <div
        data-component-id="lead-consent"
        className="mt-token-2 flex items-start gap-2 rounded-sm bg-surface-alt px-3 py-2"
      >
        <input
          id="lead-consent-checkbox"
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          aria-describedby="lead-consent-text"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand accent-brand"
        />
        <label
          id="lead-consent-text"
          htmlFor="lead-consent-checkbox"
          className="text-xs leading-relaxed text-ink-soft"
        >
          {consentText}
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        data-component-id="lead-submit"
        disabled={!canSubmit}
        className="mt-token-2 w-full"
      >
        {status === "submitting" ? "Sending…" : "Send my request"}
      </Button>
      <p className="mt-2 text-xs text-ink-muted">
        We share your details only with this partner, only after you tap send.
      </p>
    </form>
  );
}

export default LeadForm;
