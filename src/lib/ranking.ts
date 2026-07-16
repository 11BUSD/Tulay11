/**
 * Offer ranking / prioritization.
 *
 * `rankOffers` filters to active offers only, scores each by its
 * `priority_score` plus targeting boosts (Filipino/Tagalog focus, city match,
 * language match), and returns them in stable descending score order. When no
 * offer matches the requested city, it falls back to active "general" offers
 * (those with no city targeting) ordered by priority.
 *
 * Paused/inactive offers are never returned.
 */

/** Boost weights (points added to `priority_score`). Tuned, not magic. */
export const BOOST = {
  /** Filipino/Tagalog-focused offer, when the request language is Filipino. */
  filipino: 50,
  /** Offer explicitly targets the requested city. */
  city: 30,
  /** Offer explicitly targets the requested language. */
  language: 20,
} as const;

/** Language codes we treat as "Filipino / Tagalog". */
const FILIPINO_LANGS = new Set(["tl", "fil", "tagalog", "filipino"]);

/**
 * The subset of a `partner_offers` row (joined with its partner) that ranking
 * needs. Structural so callers can pass rows from any query shape.
 */
export interface RankableOffer {
  active: boolean;
  priority_score: number;
  city_targets?: string[] | null;
  language_targets?: string[] | null;
  /** Whether the offer's partner is Filipino-focused (joined from partners). */
  partner_filipino_focus?: boolean | null;
  [key: string]: unknown;
}

/** Ranking context: the viewer's city and/or language. */
export interface RankContext {
  city?: string | null;
  language?: string | null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function includesNorm(list: string[] | null | undefined, value: string): boolean {
  if (!list || value === "") return false;
  return list.some((entry) => norm(entry) === value);
}

/** True if the offer targets Filipino/Tagalog speakers (partner flag or lang). */
function isFilipinoFocused(offer: RankableOffer): boolean {
  if (offer.partner_filipino_focus) return true;
  const langs = offer.language_targets ?? [];
  return langs.some((l) => FILIPINO_LANGS.has(norm(l)));
}

/** Compute the ranking score for a single offer given the context. */
export function scoreOffer(offer: RankableOffer, ctx: RankContext): number {
  let score = offer.priority_score ?? 0;

  const city = norm(ctx.city);
  const language = norm(ctx.language);

  if (language !== "" && FILIPINO_LANGS.has(language) && isFilipinoFocused(offer)) {
    score += BOOST.filipino;
  }
  if (city !== "" && includesNorm(offer.city_targets, city)) {
    score += BOOST.city;
  }
  if (language !== "" && includesNorm(offer.language_targets, language)) {
    score += BOOST.language;
  }
  return score;
}

/**
 * Rank offers for a viewer. Steps:
 *   1. Drop inactive/paused offers (only `active === true` survive).
 *   2. Score each by priority + boosts.
 *   3. Stable-sort descending by score (ties keep input order).
 *   4. Fallback: if a city was requested but no returned offer targets it,
 *      return active "general" offers (empty city_targets) ordered by
 *      priority_score instead of city-specific ones that don't apply.
 */
export function rankOffers<T extends RankableOffer>(
  offers: T[],
  ctx: RankContext = {},
): T[] {
  const active = offers.filter((o) => o.active === true);

  // Score + stable sort (decorate-sort-undecorate to keep ties in input order).
  const scored = active.map((offer, index) => ({
    offer,
    index,
    score: scoreOffer(offer, ctx),
  }));
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const ranked = scored.map((s) => s.offer);

  const city = norm(ctx.city);
  if (city !== "") {
    const anyCityMatch = ranked.some((o) => includesNorm(o.city_targets, city));
    if (!anyCityMatch) {
      // No offer targets this city → surface general (untargeted) offers only,
      // ordered by priority_score (stable on ties).
      const general = active
        .filter((o) => (o.city_targets ?? []).length === 0)
        .map((offer, index) => ({ offer, index }))
        .sort(
          (a, b) =>
            (b.offer.priority_score ?? 0) - (a.offer.priority_score ?? 0) ||
            a.index - b.index,
        )
        .map((s) => s.offer);
      return general;
    }
  }

  return ranked;
}
