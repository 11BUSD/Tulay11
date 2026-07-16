/** Admin client — audit logs + consent records (governance viewers). */
import { api } from "../client";

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_type: "human" | "agent" | "system";
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reasoning: string | null;
  agent_run_id: string | null;
  created_at: string;
}

export function listAuditLogs(
  params: {
    entityType?: string;
    action?: string;
    actorType?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{
  logs: AuditLog[];
  pagination: { limit: number; offset: number; total: number };
}> {
  return api.get("/api/admin/audit-logs", { query: { ...params } });
}

export interface ConsentRecord {
  id: string;
  subject_id: string | null;
  subject_email_hash: string | null;
  purpose: string;
  data_categories: string[];
  shared_with: string | null;
  consent_text_version: string | null;
  basis: string | null;
  granted: boolean;
  ip_hash: string | null;
  created_at: string;
}

export function listConsentRecords(
  params: { purpose?: string; all?: boolean; limit?: number } = {},
): Promise<{ records: ConsentRecord[]; latestPerSubject: boolean }> {
  return api.get("/api/admin/consent-records", { query: { ...params } });
}

export interface ReferralClick {
  id: string;
  referral_id: string;
  user_id: string | null;
  ambassador_id: string | null;
  partner_offer_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ip_hash: string | null;
  created_at: string;
}

export function listReferralClicks(
  params: { partnerOfferId?: string; ambassadorId?: string; limit?: number } = {},
): Promise<{ clicks: ReferralClick[] }> {
  return api.get("/api/admin/referral-clicks", { query: { ...params } });
}

export interface ReferralConversion {
  id: string;
  referral_click_id: string | null;
  partner_offer_id: string;
  user_id: string | null;
  status: string;
  gross_value_cents: number | string | null;
  commission_amount_cents: number | string | null;
  commission_rule_id: string | null;
  external_conversion_id: string | null;
  created_at: string;
}

export function listReferralConversions(
  params: { status?: string; partnerOfferId?: string; limit?: number } = {},
): Promise<{ conversions: ReferralConversion[] }> {
  return api.get("/api/admin/referral-conversions", { query: { ...params } });
}
