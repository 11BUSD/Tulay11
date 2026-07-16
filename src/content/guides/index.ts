/**
 * Seed guides for the SEO/content surface. Informational only — no regulated
 * advice; each links to official sources and routes regulated questions to a
 * licensed professional. Offer blocks render the partner disclosure component.
 */
import type { Guide } from "../types";

export const GUIDES: Guide[] = [
  {
    slug: "open-a-bank-account",
    title: "How to open your first bank account in Ontario",
    summary:
      "A step-by-step overview of what newcomers need to open a chequing account in Ontario, including the documents banks typically ask for.",
    pillar: "banking",
    updated: "2026-06-01",
    sections: [
      {
        heading: "What you'll usually need",
        paragraphs: [
          "Most banks ask for two pieces of valid identification — for example a passport plus a study/work permit, PR card, or a provincial photo card. You do not need a job or a credit history to open a basic chequing account.",
          "Many banks offer newcomer account packages that waive monthly fees for the first year. Compare a few before you decide; the right account depends on your situation.",
        ],
      },
      {
        heading: "Before you go",
        paragraphs: [
          "Bring your documents, a local address if you have one, and your Social Insurance Number (SIN) if you've received it — a SIN is required for interest-earning accounts but not always for a basic chequing account.",
          "This page is general information, not financial advice. For guidance specific to your circumstances, speak with the bank directly or a licensed professional.",
        ],
      },
    ],
    officialSources: [
      {
        label: "Opening a bank account (Canada.ca)",
        href: "https://www.canada.ca/en/financial-consumer-agency/services/banking/opening-bank-account.html",
      },
      {
        label: "Get a Social Insurance Number (Canada.ca)",
        href: "https://www.canada.ca/en/employment-social-development/services/sin.html",
      },
    ],
    offer: {
      title: "Newcomer chequing accounts",
      description:
        "Compare newcomer-friendly chequing accounts from banks in our network.",
      pillar: "banking",
      href: "/dashboard",
    },
  },
  {
    slug: "finding-housing",
    title: "Finding your first place to rent in Ontario",
    summary:
      "How rentals work in Ontario — what landlords can and can't ask for, and where to get help if something goes wrong.",
    pillar: "housing",
    updated: "2026-06-01",
    sections: [
      {
        heading: "How renting works here",
        paragraphs: [
          "In Ontario a landlord can ask for first and last month's rent as a deposit, but cannot demand a damage deposit or post-dated cheques as a condition of renting. Your rights and the landlord's are set out in the Residential Tenancies Act.",
          "Standard leases use the Ontario government's standard lease form for most private rentals. Read it fully before signing.",
        ],
      },
      {
        heading: "Getting help",
        paragraphs: [
          "If you have a dispute with a landlord, the Landlord and Tenant Board handles applications. Local settlement agencies can also help you understand your options.",
          "This is general information, not legal advice. For advice about your specific situation, talk to a licensed paralegal or lawyer.",
        ],
      },
    ],
    officialSources: [
      {
        label: "Renting in Ontario: your rights (Ontario.ca)",
        href: "https://www.ontario.ca/page/renting-ontario-your-rights",
      },
      {
        label: "Landlord and Tenant Board (Ontario.ca)",
        href: "https://tribunalsontario.ca/ltb/",
      },
    ],
    offer: {
      title: "Tenant insurance for renters",
      description:
        "See tenant-insurance options from licensed providers in our network.",
      pillar: "tenant_insurance",
      href: "/dashboard",
    },
  },
  {
    slug: "finding-a-job",
    title: "Finding work as a newcomer in Ontario",
    summary:
      "Where to start your job search, how to have foreign credentials recognized, and free employment services for newcomers.",
    pillar: "jobs",
    updated: "2026-06-01",
    sections: [
      {
        heading: "Free employment help",
        paragraphs: [
          "Ontario funds free Employment Ontario services — resume help, interview coaching, and job matching — that newcomers can use. Many settlement agencies run bridging programs for specific professions.",
          "If your profession is regulated (nursing, engineering, accounting, and others), you may need your credentials assessed before you can work in that field.",
        ],
      },
      {
        heading: "Getting credentials recognized",
        paragraphs: [
          "Start with the Ontario government's credential-recognition information to find the right regulatory body for your profession.",
          "This is general information only. For advice about your specific case, contact the relevant regulatory body or a licensed professional.",
        ],
      },
    ],
    officialSources: [
      {
        label: "Employment Ontario (Ontario.ca)",
        href: "https://www.ontario.ca/page/employment-ontario",
      },
      {
        label: "Working in a regulated profession (Ontario.ca)",
        href: "https://www.ontario.ca/page/get-your-credentials-assessed-work-regulated-profession",
      },
    ],
  },
];

/** Look up a guide by slug. */
export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** All guide slugs (for static params). */
export function guideSlugs(): string[] {
  return GUIDES.map((g) => g.slug);
}
