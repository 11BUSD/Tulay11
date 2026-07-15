import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CITIES } from "@/content/cities";

export const metadata: Metadata = {
  title: "Settling by city — Tulay",
  description:
    "City-by-city starting guides for newcomers to Ontario: Toronto, Mississauga, Ottawa and more.",
};

export default function CitiesIndexPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Settling by city
      </h1>
      <p className="mt-token-2 max-w-xl text-ink-soft">
        Local starting guides for newcomers across Ontario.
      </p>
      <ul className="mt-token-4 grid gap-4 sm:grid-cols-3">
        {CITIES.map((city) => (
          <li key={city.slug}>
            <Link
              href={`/cities/${city.slug}`}
              className="block rounded-lg border border-line bg-surface p-4 hover:border-brand"
            >
              <h2 className="text-lg font-bold text-ink">{city.name}</h2>
              <p className="text-xs text-ink-muted">{city.region}</p>
              <p className="mt-1 text-sm text-ink-soft">{city.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
