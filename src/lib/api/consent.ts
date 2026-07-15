/** Client module for the consent BFF route. */
import { api } from "./client";
import type { ConsentPurpose, ConsentBasis } from "@/lib/validation";

export interface ConsentSubmission {
  subjectId?: string;
  subjectEmail?: string;
  purpose: ConsentPurpose;
  dataCategories: string[];
  sharedWith?: string;
  consequencesText?: string;
  consentTextVersion: string;
  basis?: ConsentBasis;
  granted: boolean;
}

export interface ConsentResponse {
  id: string;
  purpose: string;
  granted: boolean;
}

/** POST /api/consent — record a consent grant (or withdrawal). */
export function recordConsent(
  body: ConsentSubmission,
): Promise<ConsentResponse> {
  return api.post("/api/consent", body);
}
