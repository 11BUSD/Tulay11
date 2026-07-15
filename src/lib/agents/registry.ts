/**
 * Agent registry — the single completeness source mapping `agent_key → Agent`.
 *
 * All 14 agents (5 fully built, 9 stubs) are registered here. `getAgent(key)`
 * is how the runner loads an agent to execute; `AGENT_KEYS` / `listAgents()`
 * expose the full set for the registry-completeness test.
 */
import type { Agent } from "./types";
import { partnerResearchAgent } from "./impl/partner-research";
import { dueDiligenceAgent } from "./impl/due-diligence";
import { outreachDraftingAgent } from "./impl/outreach-drafting";
import { outreachSequencingAgent } from "./impl/outreach-sequencing";
import { offerOpsAgent } from "./impl/offer-ops";
import { stubAgents } from "./impl/stubs";

/** The 14 canonical agent keys. */
export const AGENT_KEYS = [
  "partner-research",
  "due-diligence",
  "outreach-drafting",
  "outreach-sequencing",
  "offer-ops",
  "partner-negotiation-prep",
  "content-seo",
  "growth-acquisition",
  "lifecycle-crm",
  "analytics",
  "compliance-privacy",
  "support",
  "finance-reconciliation",
  "qa-security",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

// Build the registry from the fully-built agents + the stub set.
const builtAgents: Agent[] = [
  partnerResearchAgent,
  dueDiligenceAgent,
  outreachDraftingAgent,
  outreachSequencingAgent,
  offerOpsAgent,
];

const registry = new Map<string, Agent>();
for (const agent of [...builtAgents, ...stubAgents]) {
  if (registry.has(agent.key)) {
    throw new Error(`Duplicate agent key registered: ${agent.key}`);
  }
  registry.set(agent.key, agent);
}

/** Return the agent for `key`, throwing when unknown. */
export function getAgent(key: string): Agent {
  const agent = registry.get(key);
  if (!agent) throw new Error(`Unknown agent key: ${key}`);
  return agent;
}

/** True when `key` is a registered agent. */
export function hasAgent(key: string): boolean {
  return registry.has(key);
}

/** All registered agents. */
export function listAgents(): Agent[] {
  return [...registry.values()];
}

/** All registered agent keys. */
export function listAgentKeys(): string[] {
  return [...registry.keys()];
}
