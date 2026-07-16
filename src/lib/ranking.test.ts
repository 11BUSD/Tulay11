import { describe, expect, it } from "vitest";
import { rankOffers, type RankableOffer } from "./ranking";

function offer(partial: Partial<RankableOffer> & { id: string }): RankableOffer {
  return {
    active: true,
    priority_score: 0,
    city_targets: [],
    language_targets: [],
    partner_filipino_focus: false,
    ...partial,
  };
}

describe("rankOffers", () => {
  it("returns active offers only (paused/inactive hidden)", () => {
    const offers = [
      offer({ id: "a", active: true, priority_score: 1 }),
      offer({ id: "b", active: false, priority_score: 100 }),
    ];
    const out = rankOffers(offers);
    expect(out.map((o) => o.id)).toEqual(["a"]);
  });

  it("orders by priority_score descending", () => {
    const offers = [
      offer({ id: "low", priority_score: 1 }),
      offer({ id: "high", priority_score: 10 }),
      offer({ id: "mid", priority_score: 5 }),
    ];
    expect(rankOffers(offers).map((o) => o.id)).toEqual(["high", "mid", "low"]);
  });

  it("is a stable sort on ties", () => {
    const offers = [
      offer({ id: "first", priority_score: 5 }),
      offer({ id: "second", priority_score: 5 }),
      offer({ id: "third", priority_score: 5 }),
    ];
    expect(rankOffers(offers).map((o) => o.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("boosts Filipino/Tagalog offers when language is Filipino", () => {
    const offers = [
      offer({ id: "generic", priority_score: 40 }),
      offer({ id: "fil-partner", priority_score: 10, partner_filipino_focus: true }),
      offer({ id: "fil-lang", priority_score: 10, language_targets: ["tl"] }),
    ];
    const out = rankOffers(offers, { language: "tl" });
    // fil-lang: 10 +50 (Filipino) +20 (lang target) = 80
    // fil-partner: 10 +50 (Filipino) = 60; generic: 40 (no boost)
    expect(out.map((o) => o.id)).toEqual(["fil-lang", "fil-partner", "generic"]);
  });

  it("does not apply Filipino boost for non-Filipino language", () => {
    const offers = [
      offer({ id: "generic", priority_score: 40 }),
      offer({ id: "fil", priority_score: 10, partner_filipino_focus: true }),
    ];
    const out = rankOffers(offers, { language: "en" });
    expect(out[0].id).toBe("generic");
  });

  it("boosts city and language targeted offers", () => {
    const offers = [
      offer({ id: "base", priority_score: 50 }),
      offer({ id: "city", priority_score: 30, city_targets: ["Toronto"] }),
      offer({ id: "lang", priority_score: 40, language_targets: ["es"] }),
    ];
    const out = rankOffers(offers, { city: "toronto", language: "es" });
    // city: 30+30=60, lang: 40+20=60 (tie → input order), base: 50
    expect(out.map((o) => o.id)).toEqual(["city", "lang", "base"]);
  });

  it("falls back to general (untargeted) offers when no city matches", () => {
    const offers = [
      offer({ id: "vancouver", priority_score: 100, city_targets: ["Vancouver"] }),
      offer({ id: "general-hi", priority_score: 20 }),
      offer({ id: "general-lo", priority_score: 5 }),
    ];
    const out = rankOffers(offers, { city: "Toronto" });
    // No offer targets Toronto → return only untargeted offers by priority.
    expect(out.map((o) => o.id)).toEqual(["general-hi", "general-lo"]);
  });

  it("returns city-matched offers when at least one matches", () => {
    const offers = [
      offer({ id: "toronto", priority_score: 10, city_targets: ["Toronto"] }),
      offer({ id: "general", priority_score: 5 }),
    ];
    const out = rankOffers(offers, { city: "Toronto" });
    expect(out.map((o) => o.id)).toContain("toronto");
    expect(out[0].id).toBe("toronto");
  });
});
