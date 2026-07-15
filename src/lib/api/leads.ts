/** Client module for the leads BFF route. */
import { api } from "./client";
import type { LeadConsentPayload } from "@/lib/consent/schema";

export interface LeadSubmission {
  name: string;
  email: string;
  phone?: string;
  city?: string;
  pillar: string;
  offerId?: string;
  partnerId?: string;
  partnerName?: string;
  consent: LeadConsentPayload;
}

export interface LeadResponse {
  consentId: string;
  status: string;
}

/** POST /api/leads — submit a lead with its embedded consent grant. */
export function submitLead(body: LeadSubmission): Promise<LeadResponse> {
  return api.post("/api/leads", body);
}
