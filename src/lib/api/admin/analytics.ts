/** Admin client — product + revenue analytics (Task 23). */
import { api } from "../client";

export interface PillarFunnelRow {
  pillar: string;
  starts: number;
  completions: number;
}

export interface PartnerRevenueRow {
  partner: string;
  revenue_cents: number;
}

export interface AmbassadorPerfRow {
  ambassador: string;
  referrals: number;
  attributed_cents: number;
  paid_cents: number;
}

export interface AnalyticsResponse {
  users: number;
  activated_users: number;
  activation_rate: number;
  offer_impressions: number;
  clicks: number;
  conversions: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_user_cents: number;
  payout_liability_cents: number;
  cac_cents: number;
  ltv_cents: number;
  ltv_to_cac: number;
  pillar_funnel: PillarFunnelRow[];
  revenue_by_partner: PartnerRevenueRow[];
  ambassadors: AmbassadorPerfRow[];
  estimated: string[];
}

/** GET /api/admin/analytics — the operator analytics dashboard payload. */
export function getAnalytics(): Promise<AnalyticsResponse> {
  return api.get("/api/admin/analytics");
}
