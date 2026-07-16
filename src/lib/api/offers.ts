/** Client module for the public recommendations (pillar offer feed). */
import { api } from "./client";
import type { DisclaimerDto } from "./pillars";

export interface OfferPartner {
  id: string;
  name: string;
  category: string | null;
  website: string | null;
  license_verified: boolean;
}

export interface Recommendation {
  id: string;
  partner_id: string;
  title: string;
  settlement_pillar: string | null;
  destination_url: string | null;
  tracking_code: string | null;
  offer_type: string;
  priority_score: number;
  commission_type: string;
  user_reward_value_cents: number;
  city_targets: string[];
  language_targets: string[];
  partner: OfferPartner;
  regulated: boolean;
  requires_licensed_referral: boolean;
  license_verified: boolean;
}

export interface RecommendationsResponse {
  pillar: string;
  disclaimer: DisclaimerDto;
  count: number;
  recommendations: Recommendation[];
}

/** GET /api/recommendations?pillar=&city=&lang= — the ranked offer feed. */
export function getRecommendations(params: {
  pillar: string;
  city?: string;
  lang?: string;
}): Promise<RecommendationsResponse> {
  return api.get("/api/recommendations", {
    query: {
      pillar: params.pillar,
      city: params.city,
      lang: params.lang,
    },
  });
}
