/** Admin client — partners + partner applications + due-diligence + agreements. */
import { api } from "../client";

export type PartnerStatus =
  | "prospect"
  | "contacted"
  | "in_review"
  | "active"
  | "paused"
  | "rejected";

export interface Partner {
  id: string;
  name: string;
  category: string | null;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  location: string | null;
  languages_supported: string[];
  newcomer_focus: boolean;
  filipino_focus: boolean;
  ontario_focus: boolean;
  licensed_required: boolean;
  license_type: string | null;
  license_number: string | null;
  license_verified_at: string | null;
  regulator: string | null;
  status: PartnerStatus;
  notes: string | null;
  created_at: string;
}

export interface PartnerListParams {
  status?: PartnerStatus;
  category?: string;
  filipino_focus?: boolean;
}

export function listPartners(
  params: PartnerListParams = {},
): Promise<{ partners: Partner[] }> {
  return api.get("/api/partners", { query: { ...params } });
}

export function getPartner(id: string): Promise<{ partner: Partner }> {
  return api.get(`/api/partners/${id}`);
}

export function createPartner(
  body: Partial<Partner> & { name: string },
): Promise<{ partner: Partner }> {
  return api.post("/api/partners", body);
}

export function updatePartner(
  id: string,
  body: Partial<Partner> & {
    license_verification?: {
      result: "verified" | "failed" | "expired";
      license_type?: string;
      license_number?: string;
      regulator?: string;
      method?: string;
      evidence_url?: string;
    };
  },
): Promise<{ partner: Partner }> {
  return api.patch(`/api/partners/${id}`, body);
}

export interface DueDiligenceReview {
  id: string;
  partner_id: string;
  partner_name: string | null;
  reviewer_id: string | null;
  outcome: string | null;
  checklist: unknown;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export function listDueDiligence(params: {
  partnerId?: string;
  outcome?: string;
}): Promise<{ reviews: DueDiligenceReview[] }> {
  return api.get("/api/admin/due-diligence", { query: { ...params } });
}

export interface Agreement {
  id: string;
  partner_id: string;
  partner_name: string | null;
  status: string;
  terms_summary: string | null;
  document_url: string | null;
  effective_at: string | null;
  expires_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export function listAgreements(params: {
  partnerId?: string;
  status?: string;
}): Promise<{ agreements: Agreement[] }> {
  return api.get("/api/admin/agreements", { query: { ...params } });
}
