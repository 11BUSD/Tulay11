/** Admin client — outreach approval queue, contacts, campaigns. */
import { api } from "../client";

export interface RiskFlag {
  code?: string;
  severity?: "low" | "medium" | "high";
  message?: string;
}

export interface OutreachMessage {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  state: string;
  draft_subject: string | null;
  draft_body: string | null;
  draft_reasoning: string | null;
  draft_confidence: number | string | null;
  draft_risk_flags: RiskFlag[] | string | null;
  sequence_step: number | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  sent_at: string | null;
  simulated: boolean | null;
  created_at: string;
}

export function listOutreachMessages(
  params: { state?: string; campaignId?: string } = {},
): Promise<{ messages: OutreachMessage[] }> {
  return api.get("/api/outreach/messages", { query: { ...params } });
}

export function approveMessage(
  id: string,
): Promise<{ message: OutreachMessage }> {
  return api.post(`/api/outreach/messages/${id}/approve`);
}

export function rejectMessage(
  id: string,
  reason: string,
): Promise<{ message: OutreachMessage }> {
  return api.post(`/api/outreach/messages/${id}/reject`, { reason });
}

export interface OutreachContact {
  id: string;
  partner_id: string | null;
  partner_name: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  source: string | null;
  status: string | null;
  tags: string[];
  consent_status: string;
  consent_basis: string | null;
  created_at: string;
}

export function listOutreachContacts(
  params: { partnerId?: string; consentStatus?: string } = {},
): Promise<{ contacts: OutreachContact[] }> {
  return api.get("/api/admin/outreach-contacts", { query: { ...params } });
}

export interface OutreachCampaign {
  id: string;
  name: string;
  goal: string | null;
  channel: string | null;
  status: string | null;
  created_at: string;
  message_count: number | string;
  awaiting_count: number | string;
}

export function listOutreachCampaigns(
  params: { status?: string } = {},
): Promise<{ campaigns: OutreachCampaign[] }> {
  return api.get("/api/admin/outreach-campaigns", { query: { ...params } });
}
