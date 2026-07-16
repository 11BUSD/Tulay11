"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";
import { recordConsent } from "@/lib/api/consent";
import { ApiError } from "@/lib/api/client";

const CITIES = [
  "Mississauga",
  "Toronto",
  "Brampton",
  "Ottawa",
  "Hamilton",
  "Scarborough",
  "Other Ontario city",
];

const PRIORITIES: { slug: string; icon: string; label: string }[] = [
  { slug: "banking", icon: "🏦", label: "Banking" },
  { slug: "housing", icon: "🏠", label: "Housing" },
  { slug: "phone_internet", icon: "📱", label: "Phone" },
  { slug: "jobs", icon: "💼", label: "Jobs" },
  { slug: "healthcare", icon: "🩺", label: "Healthcare" },
  { slug: "tax_benefits", icon: "🧾", label: "Tax & benefits" },
  { slug: "transportation", icon: "🚌", label: "Transport" },
  { slug: "remittance", icon: "💸", label: "Remittance" },
  { slug: "tenant_insurance", icon: "🛡️", label: "Insurance" },
  { slug: "community_life", icon: "🤝", label: "Community" },
];

const ARRIVALS = [
  { key: "recent", icon: "🛬" },
  { key: "settling", icon: "📦" },
  { key: "soon", icon: "✈️" },
] as const;

const CONSENT_VERSION = "onboarding-v1";

/**
 * <OnboardingWizard> — 3-step onboarding (arrival → language/priorities →
 * consent). The final step records an express ConsentRecord via
 * `POST /api/consent` (purpose account) and, on success, routes to the
 * dashboard. Answers are held in local state; persistence to the profile is
 * best-effort and non-blocking (the guard is cookie-based).
 */
export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const c = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [arrival, setArrival] = useState<string>("recent");
  const [city, setCity] = useState(CITIES[0]);
  const [language, setLanguage] = useState<"en" | "tl" | "both">("en");
  const [priorities, setPriorities] = useState<string[]>([
    "banking",
    "housing",
    "jobs",
  ]);
  const [consentCore, setConsentCore] = useState(true);
  const [consentReferral, setConsentReferral] = useState(true);
  const [consentUpdates, setConsentUpdates] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 3;

  function togglePriority(slug: string) {
    setPriorities((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 3) return prev;
      return [...prev, slug];
    });
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      // Record the core account consent (email optional — used as subject when
      // provided, otherwise a placeholder subject email keeps the ledger keyed).
      await recordConsent({
        subjectEmail: email.trim() || "anonymous@onboarding.tulay",
        purpose: "account",
        dataCategories: ["arrival_status", "city", "language", "priorities"],
        consequencesText:
          "Tulay uses my arrival status, city, language and priorities to " +
          "build my settlement checklist and show local services.",
        consentTextVersion: CONSENT_VERSION,
        basis: "express",
        granted: consentCore,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? "We couldn't save your choices. Please try again."
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md" data-component-id="onboarding-wizard">
      <div className="mb-token-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-muted">
          {t("step", { current: step, total: totalSteps + 1 })}
        </span>
      </div>
      <Progress
        value={(step / (totalSteps + 1)) * 100}
        label={`Onboarding progress`}
        className="mb-token-3"
      />

      {step === 1 ? (
        <section data-component-id="onboarding-step1">
          <h1 className="text-2xl font-bold text-ink">{t("step1Title")}</h1>
          <p className="italic text-ink-muted">{t("step1TitleTl")}</p>

          <div className="mt-token-3 flex flex-col gap-2">
            {ARRIVALS.map((a) => {
              const selected = arrival === a.key;
              const titleKey =
                a.key === "recent"
                  ? "arrivalRecent"
                  : a.key === "settling"
                    ? "arrivalSettling"
                    : "arrivalSoon";
              const subKey =
                a.key === "recent"
                  ? "arrivalRecentSub"
                  : a.key === "settling"
                    ? "arrivalSettlingSub"
                    : "arrivalSoonSub";
              return (
                <button
                  key={a.key}
                  type="button"
                  data-component-id={`arrival-${a.key}`}
                  aria-pressed={selected}
                  onClick={() => setArrival(a.key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-token-2 text-left transition-colors",
                    selected
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:bg-surface-alt",
                  )}
                >
                  <span aria-hidden="true" className="text-xl">
                    {a.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-ink">
                      {t(titleKey)}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {t(subKey)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-token-3 block text-sm text-ink">
            <span className="mb-1 block font-medium">{t("cityLabel")}</span>
            <select
              data-component-id="arrival-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink"
            >
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>

          <p className="mt-token-2 rounded-sm bg-surface-alt px-3 py-2 text-xs text-ink-soft">
            🔒 {t("arrivalNote")}
          </p>

          <Button className="mt-token-3 w-full" onClick={() => setStep(2)}>
            {c("continue")}
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section data-component-id="onboarding-step2">
          <h1 className="text-2xl font-bold text-ink">{t("step2Title")}</h1>
          <p className="italic text-ink-muted">{t("step2TitleTl")}</p>

          <p className="mt-token-3 text-sm font-medium text-ink">
            {t("preferredLanguage")}
          </p>
          <div
            role="group"
            aria-label={t("preferredLanguage")}
            data-component-id="language-select"
            className="mt-1 grid grid-cols-3 gap-2"
          >
            {(["en", "tl", "both"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={language === opt}
                onClick={() => setLanguage(opt)}
                className={cn(
                  "rounded-sm border px-2 py-2 text-sm font-medium transition-colors",
                  language === opt
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink hover:bg-surface-alt",
                )}
              >
                {opt === "en" ? "English" : opt === "tl" ? "Tagalog" : "Both"}
              </button>
            ))}
          </div>

          <p className="mt-token-3 text-sm font-medium text-ink">
            {t("prioritiesLabel")}{" "}
            <span className="text-ink-muted">({t("prioritiesHint")})</span>
          </p>
          <div
            data-component-id="priority-tags"
            className="mt-1 flex flex-wrap gap-2"
          >
            {PRIORITIES.map((p) => {
              const on = priorities.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  data-component-id={`prio-${p.slug}`}
                  aria-pressed={on}
                  onClick={() => togglePriority(p.slug)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                    on
                      ? "border-brand bg-brand-soft text-brand-dark"
                      : "border-line bg-surface text-ink hover:bg-surface-alt",
                  )}
                >
                  {on ? <span aria-hidden="true">✓</span> : null}
                  <span>
                    {p.icon} {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-token-3 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setStep(1)}
            >
              {c("back")}
            </Button>
            <Button className="flex-1" onClick={() => setStep(3)}>
              {c("continue")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section data-component-id="onboarding-step3">
          <h1 className="text-2xl font-bold text-ink">{t("step3Title")}</h1>
          <p className="italic text-ink-muted">{t("step3TitleTl")}</p>

          <div className="mt-token-3 flex flex-col gap-2">
            <ConsentToggle
              id="consent-core"
              checked={consentCore}
              onChange={setConsentCore}
              title={t("consentCoreTitle")}
              required={t("consentCoreRequired")}
              body={t("consentCoreBody")}
              who={t("consentCoreWho")}
            />
            <ConsentToggle
              id="consent-referral"
              checked={consentReferral}
              onChange={setConsentReferral}
              title={t("consentReferralTitle")}
              body={t("consentReferralBody")}
              who={t("consentReferralWho")}
            />
            <ConsentToggle
              id="consent-updates"
              checked={consentUpdates}
              onChange={setConsentUpdates}
              title={t("consentUpdatesTitle")}
              body={t("consentUpdatesBody")}
              who={t("consentUpdatesWho")}
            />
          </div>

          <label className="mt-token-3 block text-sm text-ink">
            <span className="mb-1 block font-medium">Email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@email.com"
              className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink"
            />
          </label>

          <p className="mt-token-2 text-xs text-ink-muted">{t("fineprint")}</p>

          {error ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-token-3 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setStep(2)}
            >
              {c("back")}
            </Button>
            <Button
              className="flex-1"
              data-component-id="step3-continue"
              disabled={!consentCore || submitting}
              onClick={finish}
            >
              {submitting ? "…" : t("finish")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ConsentToggle({
  id,
  checked,
  onChange,
  title,
  required,
  body,
  who,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  required?: string;
  body: string;
  who: string;
}) {
  return (
    <div
      data-component-id={id}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-token-2 transition-colors",
        checked ? "border-brand bg-brand-soft" : "border-line bg-surface",
      )}
    >
      <input
        id={`${id}-switch`}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-line text-brand accent-brand"
      />
      <label htmlFor={`${id}-switch`} className="flex-1 cursor-pointer">
        <span className="block font-semibold text-ink">
          {title}
          {required ? (
            <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
              {required}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm text-ink-soft">{body}</span>
        <span className="mt-1 block text-xs text-ink-muted">{who}</span>
      </label>
    </div>
  );
}

export default OnboardingWizard;
