import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { JsonLd } from "@/components/content/JsonLd";
import { ContentOfferBlock } from "@/components/content/ContentOfferBlock";
import { getCity, citySlugs } from "@/content/cities";

export const dynamicParams = false;

/** Pre-render all seed cities at build time. */
export function generateStaticParams(): { city: string }[] {
  return citySlugs().map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const entry = getCity(city);
  if (!entry) return { title: "City not found — Tulay" };
  return {
    title: `Settling in ${entry.name} — Tulay`,
    description: entry.summary,
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const entry = getCity(city);
  if (!entry) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Settling in ${entry.name}`,
    description: entry.summary,
    dateModified: entry.updated,
    inLanguage: "en",
    isAccessibleForFree: true,
    about: { "@type": "City", name: entry.name },
    author: { "@type": "Organization", name: "Tulay" },
    publisher: { "@type": "Organization", name: "Tulay" },
  };

  return (
    <AppShell>
      <JsonLd data={jsonLd} />
      <article className="max-w-2xl">
        <nav className="text-sm text-ink-muted">
          <Link href="/cities" className="hover:text-brand">
            Cities
          </Link>{" "}
          / <span>{entry.name}</span>
        </nav>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
          Settling in {entry.name}
        </h1>
        <p className="text-sm text-ink-muted">{entry.region}</p>
        <p className="mt-token-2 text-lg text-ink-soft">{entry.summary}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Last reviewed {entry.updated} · General information, not advice.
        </p>

        {entry.sections.map((section) => (
          <section key={section.heading} className="mt-token-4">
            <h2 className="text-xl font-bold text-ink">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mt-token-2 leading-relaxed text-ink-soft">
                {p}
              </p>
            ))}
          </section>
        ))}

        <section className="mt-token-4">
          <h2 className="text-xl font-bold text-ink">Official sources</h2>
          <ul className="mt-token-2 list-disc space-y-1 pl-5 text-ink-soft">
            {entry.officialSources.map((src) => (
              <li key={src.href}>
                <a
                  href={src.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand underline"
                >
                  {src.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {entry.offer ? <ContentOfferBlock offer={entry.offer} /> : null}
      </article>
    </AppShell>
  );
}
