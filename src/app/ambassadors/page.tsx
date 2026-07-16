import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { ShareLink } from "@/components/ambassadors/ShareLink";

/**
 * The seeded ambassador referral code. Until ambassador auth lands, the program
 * page previews the shareable link with the seeded code so the deep-link flow
 * (`/r/<code>`) is demonstrable end to end.
 */
const DEMO_AMBASSADOR_CODE = "SEED-AMB-01";

/**
 * Ambassador program landing (Growth): explains how the program works and
 * surfaces a shareable referral deep link. The link resolves through the
 * `/r/[code]` route handler, which sets the attribution cookie and redirects.
 */
export default async function AmbassadorsPage() {
  const t = await getTranslations("ambassadors");

  const steps = [t("how1"), t("how2"), t("how3")];

  return (
    <AppShell>
      <section className="py-token-3">
        <span className="text-xs font-bold uppercase tracking-widest text-gold">
          {t("eyebrow")}
        </span>
        <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-tight text-ink">
          {t("title")}
        </h1>
        <p className="mt-token-2 max-w-xl text-lg text-ink-soft">{t("lede")}</p>
        <Link
          href="/onboarding"
          data-component-id="ambassador-join"
          className="mt-token-3 inline-flex h-11 items-center rounded-sm bg-brand px-5 font-semibold text-white"
        >
          {t("join")}
        </Link>
      </section>

      <section className="py-token-3">
        <h2 className="mb-token-2 text-lg font-semibold text-ink">
          {t("howTitle")}
        </h2>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface p-token-2"
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-dark"
              >
                {i + 1}
              </span>
              <span className="text-sm text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-token-3">
        <ShareLink code={DEMO_AMBASSADOR_CODE} />
      </section>
    </AppShell>
  );
}
