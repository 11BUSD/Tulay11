/** Client module for the pillars BFF routes. */
import { api } from "./client";

export type PillarProgressStatus = "not_started" | "in_progress" | "done";

export interface Pillar {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  icon: string | null;
  progress: { status: PillarProgressStatus; percent: number };
}

export interface DisclaimerDto {
  pillar: string;
  regulator: string | null;
  body: string;
  requires_licensed_referral: boolean;
}

/** GET /api/pillars — the ordered pillar list with stubbed progress. */
export function listPillars(): Promise<{ count: number; pillars: Pillar[] }> {
  return api.get("/api/pillars");
}

/** GET /api/pillars/[slug] — a single pillar plus its disclaimer config. */
export function getPillar(
  slug: string,
): Promise<{ pillar: Pillar; disclaimer: DisclaimerDto }> {
  return api.get(`/api/pillars/${encodeURIComponent(slug)}`);
}
