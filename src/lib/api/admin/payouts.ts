/** Admin client — payouts ledger + status transitions. */
import { api } from "../client";

export type PayoutStatus = "pending" | "approved" | "paid" | "rejected";

export interface Payout {
  id: string;
  conversion_id: string | null;
  ambassador_id: string | null;
  partner_id: string | null;
  payee_type: string;
  /** bigint cents — string from node-postgres; coerce before formatCents. */
  amount_cents: number | string;
  currency: string;
  status: PayoutStatus;
  parent_payout_id: string | null;
  paid_at: string | null;
  external_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface PayoutSummary {
  by_status: Record<string, { total_cents: number; count: number }>;
  outstanding_liability_cents: number;
}

export interface PayoutListParams {
  status?: PayoutStatus;
  ambassador_id?: string;
  partner_id?: string;
}

export function listPayouts(
  params: PayoutListParams = {},
): Promise<{ payouts: Payout[]; summary: PayoutSummary }> {
  return api.get("/api/payouts", { query: { ...params } });
}

export function updatePayoutStatus(
  id: string,
  status: PayoutStatus,
  extra: { notes?: string; external_ref?: string } = {},
): Promise<{ payout: Payout }> {
  return api.patch(`/api/payouts/${id}/status`, { status, ...extra });
}
