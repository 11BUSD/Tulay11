/** Client module for the profile + data-requests BFF routes. */
import { api } from "./client";

export interface Profile {
  id: string;
  role: string;
  displayName: string | null;
  preferredLanguage: string;
  city: string | null;
}

/** GET /api/profile?id=... — the profile row. */
export function getProfile(id: string): Promise<Profile> {
  return api.get("/api/profile", { query: { id } });
}

/** PATCH /api/profile — update editable profile fields. */
export function updateProfile(body: {
  id: string;
  displayName?: string | null;
  preferredLanguage?: "en" | "tl";
  city?: string | null;
}): Promise<Profile> {
  return api.patch("/api/profile", body);
}

export interface DataRequestResponse {
  id: string;
  kind: "export" | "delete";
  status: string;
}

/** POST /api/data-requests — PIPEDA export/delete intake. */
export function submitDataRequest(body: {
  subjectId?: string;
  subjectEmail?: string;
  kind: "export" | "delete";
}): Promise<DataRequestResponse> {
  return api.post("/api/data-requests", body);
}
