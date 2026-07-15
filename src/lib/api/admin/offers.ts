/** Admin client — partner offers. */
import { api } from "../client";

export interface AdminOffer {
  id: string;
  partner_id: string;
  title: string;
  description: string | null;
  settlement_pillar: string | null;
  offer_type: string;
  destination_url: string | null;
  tracking_code: string | null;
  commission_type: string;
  /** bigint cents — node-postgres returns as string; coerce before formatCents. */
  commission_value_cents: number | string;
  user_reward_value_cents: number | string;
  city_targets: string[];
  language_targets: string[];
  active: boolean;
  priority_score: number;
  compliance_notes: string | null;
  status: string;
  created_at: string;
}

export interface OfferListParams {
  pillar?: string;
  partner_id?: string;
  active?: boolean;
}

export function listOffers(
  params: OfferListParams = {},
): Promise<{ offers: AdminOffer[] }> {
  return api.get("/api/offers", { query: { ...params } });
}

export function getOffer(id: string): Promise<{ offer: AdminOffer }> {
  return api.get(`/api/offers/${id}`);
}

export function createOffer(
  body: Partial<AdminOffer> & {
    partner_id: string;
    title: string;
    settlement_pillar: string;
  },
): Promise<{ offer: AdminOffer }> {
  return api.post("/api/offers", body);
}

export function updateOffer(
  id: string,
  body: Partial<AdminOffer>,
): Promise<{ offer: AdminOffer }> {
  return api.patch(`/api/offers/${id}`, body);
}
