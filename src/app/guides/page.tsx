import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { GUIDES } from "@/content/guides";

export const metadata: Metadata = {
  title: "Newcomer guides — Tulay",
  description:
    "Free, plain-language guides for newcomers settling in Ontario: banking, housing, jobs and more.",
};

export default function GuidesIndexPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Newcomer guides
      </h1>
      <p className="mt-token-2 max-w-xl text-ink-soft">
        Free, plain-language guides for settling in Ontario. Informational
        only — we route regulated questions to a licensed professional.
      </p>
      <ul className="mt-token-4 grid gap-4 sm:grid-cols-2">
        {GUIDES.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="block rounded-lg border border-line bg-surface p-4 hover:border-brand"
            >
              <h2 className="text-lg font-bold text-ink">{guide.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{guide.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
