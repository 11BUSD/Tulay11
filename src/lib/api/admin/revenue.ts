/** Admin client — revenue analytics (AC9: six sliceable dimensions). */
import { api } from "../client";

export const REVENUE_DIMENSIONS = [
  "pillar",
  "partner",
  "offer",
  "channel",
  "ambassador",
  "cohort",
] as const;

export type RevenueDimension = (typeof REVENUE_DIMENSIONS)[number];

export interface RevenueSlice {
  key: string;
  total_cents: number;
  event_count: number;
}

export interface RevenueResponse {
  groupBy: RevenueDimension;
  total_cents: number;
  slices: RevenueSlice[];
  payout_liability: {
    by_status: Record<string, number>;
    unpaid_cents: number;
  };
}

/** GET /api/admin/revenue?groupBy=<dimension> — issues the correct query param. */
export function getRevenue(
  groupBy: RevenueDimension,
): Promise<RevenueResponse> {
  return api.get("/api/admin/revenue", { query: { groupBy } });
}
