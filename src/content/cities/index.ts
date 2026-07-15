/**
 * Seed city landing pages for the SEO/content surface. Informational only —
 * no regulated advice; each links to official municipal/provincial sources.
 */
import type { City } from "../types";

export const CITIES: City[] = [
  {
    slug: "toronto",
    name: "Toronto",
    region: "Greater Toronto Area",
    summary:
      "A newcomer's starting guide to settling in Toronto — transit, health coverage, and free settlement services across the city.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Getting around",
        paragraphs: [
          "Toronto's transit is run by the TTC (subway, streetcars, buses). A PRESTO card works across the TTC and GO Transit for regional trips.",
          "Many neighbourhoods have free newcomer information sessions run by settlement agencies — a good first stop when you arrive.",
        ],
      },
      {
        heading: "Health coverage",
        paragraphs: [
          "Ontario's public health plan (OHIP) covers most medically necessary care. Apply as soon as you're eligible; there may be a waiting period, so consider interim private coverage.",
          "This page is general information, not medical, legal or financial advice.",
        ],
      },
    ],
    officialSources: [
      {
        label: "Newcomers to Toronto (City of Toronto)",
        href: "https://www.toronto.ca/community-people/moving-to-toronto/",
      },
      {
        label: "Apply for OHIP (Ontario.ca)",
        href: "https://www.ontario.ca/page/apply-ohip-and-get-health-card",
      },
    ],
    offer: {
      title: "Phone & internet plans",
      description:
        "Compare newcomer phone and internet plans from providers in our network.",
      pillar: "phone_internet",
      href: "/dashboard",
    },
  },
  {
    slug: "mississauga",
    name: "Mississauga",
    region: "Peel Region",
    summary:
      "Settling in Mississauga — MiWay transit, library newcomer programs, and where to find free settlement support in Peel Region.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Getting around",
        paragraphs: [
          "Mississauga's local transit is MiWay, and it connects to GO Transit for trips into Toronto and across the GTA. PRESTO works on both.",
          "The Mississauga Library runs free newcomer settlement programs and language circles at several branches.",
        ],
      },
      {
        heading: "Settlement support",
        paragraphs: [
          "Peel Region has several funded settlement agencies that help with paperwork, job search, and connecting to services — most are free for newcomers.",
          "This page is general information only, not regulated advice.",
        ],
      },
    ],
    officialSources: [
      {
        label: "New to Canada (City of Mississauga)",
        href: "https://www.mississauga.ca/services-and-programs/",
      },
      {
        label: "Settlement services in Ontario (Canada.ca)",
        href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants/new-life-canada/find-help-community.html",
      },
    ],
  },
  {
    slug: "ottawa",
    name: "Ottawa",
    region: "Eastern Ontario",
    summary:
      "A newcomer's guide to Ottawa — bilingual services, OC Transpo transit, and settlement help in Canada's capital.",
    updated: "2026-06-01",
    sections: [
      {
        heading: "A bilingual city",
        paragraphs: [
          "Ottawa offers many services in both English and French, which can help if French is one of your languages. City and federal services are widely available.",
          "OC Transpo runs local buses and the O-Train light rail; a PRESTO card works across the system.",
        ],
      },
      {
        heading: "Settlement support",
        paragraphs: [
          "Ottawa has funded settlement agencies offering free help with housing, employment and language learning.",
          "This page is general information only. Route any regulated questions to a licensed professional.",
        ],
      },
    ],
    officialSources: [
      {
        label: "Newcomer information (City of Ottawa)",
        href: "https://ottawa.ca/en/city-hall/newcomers",
      },
      {
        label: "Find free newcomer services (Canada.ca)",
        href: "https://ircc.canada.ca/english/newcomers/services/index.asp",
      },
    ],
  },
];

/** Look up a city by slug. */
export function getCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}

/** All city slugs (for static params). */
export function citySlugs(): string[] {
  return CITIES.map((c) => c.slug);
}
