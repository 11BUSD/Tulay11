/** Admin client — agent runs (activity feed). */
import { api } from "../client";

export interface AgentRun {
  id: string;
  agent_key: string;
  agent_version: string | null;
  status: string;
  trigger_type: string | null;
  triggered_by: string | null;
  confidence: number | string | null;
  reasoning_summary: string | null;
  related_partner_id: string | null;
  related_contact_id: string | null;
  related_campaign_id: string | null;
  attempt: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export function listAgentRuns(
  params: {
    agentKey?: string;
    status?: string;
    partnerId?: string;
    contactId?: string;
    campaignId?: string;
  } = {},
): Promise<{ runs: AgentRun[] }> {
  return api.get("/api/agents/runs", { query: { ...params } });
}
