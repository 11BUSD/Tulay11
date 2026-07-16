import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { JsonLd } from "@/components/content/JsonLd";
import { ContentOfferBlock } from "@/components/content/ContentOfferBlock";
import { getGuide, guideSlugs } from "@/content/guides";

export const dynamicParams = false;

/** Pre-render all seed guides at build time. */
export function generateStaticParams(): { slug: string }[] {
  return guideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found — Tulay" };
  return {
    title: `${guide.title} — Tulay`,
    description: guide.summary,
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  // Article JSON-LD (informational; no regulated advice).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.summary,
    dateModified: guide.updated,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "Tulay" },
    publisher: { "@type": "Organization", name: "Tulay" },
  };

  return (
    <AppShell>
      <JsonLd data={jsonLd} />
      <article className="max-w-2xl">
        <nav className="text-sm text-ink-muted">
          <Link href="/guides" className="hover:text-brand">
            Guides
          </Link>{" "}
          / <span>{guide.title}</span>
        </nav>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
          {guide.title}
        </h1>
        <p className="mt-token-2 text-lg text-ink-soft">{guide.summary}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Last reviewed {guide.updated} · General information, not advice.
        </p>

        {guide.sections.map((section) => (
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
            {guide.officialSources.map((src) => (
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

        {guide.offer ? <ContentOfferBlock offer={guide.offer} /> : null}
      </article>
    </AppShell>
  );
}
