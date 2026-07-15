/** Client module for the saved-resources BFF route. */
import { api } from "./client";

export interface SavedItem {
  id: string;
  offerId: string | null;
  pillar: string | null;
  title: string;
  url: string | null;
  createdAt: string;
}

/** GET /api/saved?subjectRef=... — the subject's saved items. */
export function listSaved(
  subjectRef: string,
): Promise<{ count: number; saved: SavedItem[] }> {
  return api.get("/api/saved", { query: { subjectRef } });
}

/** POST /api/saved — save an offer/resource. */
export function saveItem(body: {
  subjectRef: string;
  offerId?: string;
  pillar?: string;
  title: string;
  url?: string;
}): Promise<SavedItem> {
  return api.post("/api/saved", body);
}

/** DELETE /api/saved — remove a saved item. */
export function removeSaved(body: {
  subjectRef: string;
  id: string;
}): Promise<{ id: string; deleted: boolean }> {
  return api.delete("/api/saved", { body });
}
