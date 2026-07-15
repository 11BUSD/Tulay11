/** Admin client — ambassadors (list + activate/suspend). */
import { api } from "../client";

export type AmbassadorStatus = "active" | "paused" | "inactive";

export interface Ambassador {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referral_code: string;
  languages: string[];
  city: string | null;
  filipino_focus: boolean;
  split_percentage_bps: number;
  status: AmbassadorStatus;
  created_at: string;
  /** Rollups (bigint/count from node-postgres → string). */
  referral_count: number | string;
  attributed_cents: number | string;
}

export function listAmbassadors(
  params: { status?: AmbassadorStatus; filipinoFocus?: boolean } = {},
): Promise<{ ambassadors: Ambassador[] }> {
  return api.get("/api/admin/ambassadors", { query: { ...params } });
}

export function updateAmbassadorStatus(
  id: string,
  status: AmbassadorStatus,
): Promise<{ ambassador: Ambassador }> {
  return api.patch(`/api/admin/ambassadors/${id}`, { status });
}
