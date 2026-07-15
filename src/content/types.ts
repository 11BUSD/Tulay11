/**
 * Content types for the growth/SEO surfaces (guides, cities, FAQs).
 *
 * These pages are INFORMATIONAL only. They must never contain regulated advice
 * (mortgage/insurance/legal/immigration/tax/investment/credit specifics) — a
 * guide may point readers to official sources and route regulated questions to
 * a licensed professional, but it does not give the advice itself.
 *
 * A guide/city may include monetized "offer" blocks; every such block MUST be
 * accompanied by the partner-disclosure component in the rendered page.
 */

/** A link to an authoritative official source (Canada.ca, Ontario.ca, etc). */
export interface OfficialSource {
  label: string;
  href: string;
}

/** A monetized offer block on a content page (renders partner disclosure). */
export interface ContentOffer {
  /** Headline for the offer block. */
  title: string;
  /** Short plain-language description (no regulated advice / guarantees). */
  description: string;
  /** The settlement pillar this offer maps to (drives the disclaimer). */
  pillar: string;
  /** Where "See offers" routes to (the ranked, disclosed recommendations feed). */
  href: string;
}

/** A content section (heading + paragraphs). */
export interface ContentSection {
  heading: string;
  paragraphs: string[];
}

/** A settlement guide (e.g. "Open your first bank account"). */
export interface Guide {
  slug: string;
  title: string;
  summary: string;
  /** Settlement pillar the guide relates to. */
  pillar: string;
  /** ISO date last reviewed (shown + used in JSON-LD). */
  updated: string;
  sections: ContentSection[];
  officialSources: OfficialSource[];
  /** Optional monetized offer block (renders partner disclosure). */
  offer?: ContentOffer;
}

/** A city landing page (e.g. Toronto). */
export interface City {
  slug: string;
  name: string;
  region: string;
  summary: string;
  updated: string;
  sections: ContentSection[];
  officialSources: OfficialSource[];
  offer?: ContentOffer;
}

/** A single FAQ entry. */
export interface FaqItem {
  question: string;
  answer: string;
}
