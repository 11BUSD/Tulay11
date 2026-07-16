/** Client module for the concierge chat BFF route. */
import { api } from "./client";
import type { DisclaimerDto } from "./pillars";

export interface ConciergeResponse {
  reply: string;
  regulated: boolean;
  routeToPro?: {
    pillar: string;
    disclaimer: DisclaimerDto;
  };
}

/** POST /api/concierge/chat — a single concierge turn. */
export function askConcierge(body: {
  message: string;
  pillar?: string;
  lang?: "en" | "tl";
}): Promise<ConciergeResponse> {
  return api.post("/api/concierge/chat", body);
}
