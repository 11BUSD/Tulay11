/**
 * Content/SEO surface tests (Task 23).
 *
 *   - JSON-LD: the guide/city Article schema and FAQPage schema render inside a
 *     `<script type="application/ld+json">` and parse back to the expected type.
 *   - Offer blocks on a content page ALWAYS render the partner-disclosure
 *     component; regulated pillars additionally render the licensing disclaimer.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { JsonLd } from "../JsonLd";
import { ContentOfferBlock } from "../ContentOfferBlock";
import { GUIDES } from "@/content/guides";
import { CITIES } from "@/content/cities";
import { FAQS } from "@/content/faqs";
import type { ContentOffer } from "@/content/types";

function parseJsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector(
    'script[type="application/ld+json"]',
  );
  expect(script).not.toBeNull();
  return JSON.parse(script!.textContent ?? "{}");
}

describe("JSON-LD structured data", () => {
  it("emits Article JSON-LD for a guide", () => {
    const guide = GUIDES[0];
    const { container } = render(
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          dateModified: guide.updated,
        }}
      />,
    );
    const data = parseJsonLd(container);
    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBe(guide.title);
  });

  it("emits Article JSON-LD for a city", () => {
    const city = CITIES[0];
    const { container } = render(
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `Settling in ${city.name}`,
        }}
      />,
    );
    const data = parseJsonLd(container);
    expect(data["@type"]).toBe("Article");
    expect(data.headline).toContain(city.name);
  });

  it("emits FAQPage JSON-LD for the FAQ set", () => {
    const { container } = render(
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }}
      />,
    );
    const data = parseJsonLd(container);
    expect(data["@type"]).toBe("FAQPage");
    expect(Array.isArray(data.mainEntity)).toBe(true);
    expect((data.mainEntity as unknown[]).length).toBe(FAQS.length);
  });
});

describe("ContentOfferBlock", () => {
  it("renders the partner disclosure on a non-regulated offer", () => {
    const offer: ContentOffer = {
      title: "Newcomer chequing accounts",
      description: "Compare accounts.",
      pillar: "banking",
      href: "/dashboard",
    };
    const { container } = render(<ContentOfferBlock offer={offer} />);
    const disclosure = container.querySelector(
      '[data-component-id="partner-disclosure"]',
    );
    expect(disclosure).not.toBeNull();
    // Non-regulated → no licensing disclaimer.
    expect(
      container.querySelector('[data-component-id="regulated-disclaimer"]'),
    ).toBeNull();
  });

  it("renders BOTH partner disclosure and licensing disclaimer for a regulated pillar", () => {
    const offer: ContentOffer = {
      title: "Tenant insurance",
      description: "Compare tenant insurance.",
      pillar: "tenant_insurance",
      href: "/dashboard",
    };
    const { container } = render(<ContentOfferBlock offer={offer} />);
    expect(
      container.querySelector('[data-component-id="partner-disclosure"]'),
    ).not.toBeNull();
    const regulated = container.querySelector(
      '[data-component-id="regulated-disclaimer"]',
    );
    expect(regulated).not.toBeNull();
    expect(regulated!.textContent).toContain("FSRA");
  });

  it("every seed guide/city offer maps to a resolvable pillar", () => {
    const offers = [
      ...GUIDES.map((g) => g.offer),
      ...CITIES.map((c) => c.offer),
    ].filter((o): o is ContentOffer => Boolean(o));
    for (const offer of offers) {
      const { container } = render(<ContentOfferBlock offer={offer} />);
      expect(
        container.querySelector('[data-component-id="partner-disclosure"]'),
      ).not.toBeNull();
    }
  });
});
