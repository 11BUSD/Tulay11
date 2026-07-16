import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";

/** The 10 settlement pillars shown on the landing grid (icons for display). */
const PILLARS: { slug: string; icon: string; labelKey: string }[] = [
  { slug: "banking", icon: "🏦", labelKey: "Banking" },
  { slug: "phone_internet", icon: "📱", labelKey: "Phone & Internet" },
  { slug: "housing", icon: "🏠", labelKey: "Housing" },
  { slug: "tenant_insurance", icon: "🛡️", labelKey: "Tenant Insurance" },
  { slug: "jobs", icon: "💼", labelKey: "Jobs" },
  { slug: "healthcare", icon: "🩺", labelKey: "Healthcare" },
  { slug: "tax_benefits", icon: "🧾", labelKey: "Tax & Benefits" },
  { slug: "transportation", icon: "🚌", labelKey: "Transportation" },
  { slug: "remittance", icon: "💸", labelKey: "Remittance" },
  { slug: "community_life", icon: "🤝", labelKey: "Community" },
];

/**
 * Marketing landing page (matches `landing-warm-bridge.html`): hero + CTA into
 * onboarding, 10-pillar grid, trust band, how-it-works, and the affiliate
 * disclosure. Bilingual via next-intl.
 */
export default async function HomePage() {
  const t = await getTranslations("landing");

  return (
    <AppShell>
      {/* HERO */}
      <section className="py-token-4">
        <span className="text-xs font-bold uppercase tracking-widest text-gold">
          {t("eyebrow")}
        </span>
        <h1 className="mt-2 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-ink">
          {t("heroTitle")}
        </h1>
        <p className="mt-token-2 max-w-xl text-lg text-ink-soft">
          {t("heroLede")}{" "}
          <span className="italic text-ink-muted">{t("heroLedeTl")}</span>
        </p>
        <div className="mt-token-3 flex flex-wrap gap-token-2">
          <Link
            href="/onboarding"
            data-component-id="hero-cta-start"
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-medium text-white transition-colors hover:bg-brand-dark"
          >
            {t("ctaStart")}
          </Link>
          <Link
            href="#pillars"
            data-component-id="hero-cta-explore"
            className="inline-flex h-12 items-center justify-center rounded-full border border-brand bg-transparent px-6 text-base font-medium text-brand transition-colors hover:bg-brand-soft"
          >
            {t("ctaExplore")}
          </Link>
        </div>
        <div className="mt-token-3 flex flex-wrap gap-token-3 text-sm font-medium text-ink-soft">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            {t("trustFree")}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            {t("trustBilingual")}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            {t("trustNoSin")}
          </span>
        </div>
      </section>

      {/* PILLARS */}
      <section id="pillars" className="py-token-4">
        <div className="mx-auto mb-token-3 max-w-xl text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-gold">
            {t("pillarsEyebrow")}
          </span>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
            {t("pillarsTitle")}
          </h2>
          <p className="mt-2 text-ink-soft">{t("pillarsLede")}</p>
        </div>
        <div className="grid grid-cols-2 gap-token-2 sm:grid-cols-3 md:grid-cols-5">
          {PILLARS.map((p) => (
            <Link
              key={p.slug}
              href={`/pillars/${p.slug}`}
              data-component-id={`pillar-${p.slug}`}
              className="rounded-lg border border-line bg-surface p-token-2 transition-transform hover:-translate-y-1 hover:shadow-sm"
            >
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-sm bg-brand-soft text-lg">
                {p.icon}
              </div>
              <h3 className="text-sm font-semibold text-ink">{p.labelKey}</h3>
            </Link>
          ))}
        </div>
      </section>

      {/* TRUST BAND */}
      <section id="trust" className="py-token-4">
        <div className="grid grid-cols-1 gap-token-3 rounded-lg bg-surface-alt p-token-4 sm:grid-cols-2 md:grid-cols-4">
          {[
            ["trustFreeTitle", "trustFreeBody"],
            ["trustLicensedTitle", "trustLicensedBody"],
            ["trustTransparentTitle", "trustTransparentBody"],
            ["trustPrivateTitle", "trustPrivateBody"],
          ].map(([title, body]) => (
            <div key={title}>
              <h4 className="text-2xl font-extrabold text-brand-dark">
                {t(title)}
              </h4>
              <p className="mt-1 text-sm text-ink-soft">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-token-4">
        <div className="mx-auto mb-token-3 max-w-xl text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-gold">
            {t("howEyebrow")}
          </span>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
            {t("howTitle")}
          </h2>
          <p className="mt-2 italic text-ink-muted">{t("howTitleTl")}</p>
        </div>
        <div className="grid grid-cols-1 gap-token-2 md:grid-cols-3">
          {[
            ["1", "how1Title", "how1Body"],
            ["2", "how2Title", "how2Body"],
            ["3", "how3Title", "how3Body"],
          ].map(([num, title, body]) => (
            <div
              key={num}
              className="rounded-lg border border-line bg-surface p-token-3"
            >
              <div className="mb-3 grid h-8 w-8 place-items-center rounded-sm bg-gold-soft text-sm font-extrabold text-gold">
                {num}
              </div>
              <h3 className="text-lg font-semibold text-ink">{t(title)}</h3>
              <p className="mt-1 text-sm text-ink-soft">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mx-auto max-w-xl py-token-3 text-center text-xs text-ink-muted">
        {t("disclosure")}
      </p>
    </AppShell>
  );
}
