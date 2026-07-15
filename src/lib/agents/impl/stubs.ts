/**
 * Stub agents (8) — registered so the orchestration layer is complete, but not
 * wired for autonomous output this phase.
 *
 * Each implements the `Agent` interface, accepts a permissive input, performs
 * NO side effects (only an audit row noting the no-op), and returns
 * `status: 'needs_review'` with a "not implemented in Phase-2 MVP" reasoning
 * summary and zero confidence.
 */
import { z } from "zod";
import type { Agent, AgentContext, AgentResult } from "../types";

/** Permissive input for stub agents — they don't consume it. */
const stubInput = z.unknown();

interface StubSpec {
  key: string;
  purpose: string;
}

const STUB_SPECS: StubSpec[] = [
  { key: "partner-negotiation-prep", purpose: "Prep talking points/term ranges from DD" },
  { key: "content-seo", purpose: "Generate marketing/SEO content drafts" },
  { key: "growth-acquisition", purpose: "Acquisition experiment proposals" },
  { key: "lifecycle-crm", purpose: "Lifecycle nudges / segmentation" },
  { key: "analytics", purpose: "Metrics summaries/insights" },
  { key: "support", purpose: "Draft support replies" },
  { key: "finance-reconciliation", purpose: "Reconcile payouts/ledger" },
  { key: "qa-security", purpose: "Security/QA review of agent output" },
];

function makeStub(spec: StubSpec): Agent<unknown, { note: string }> {
  return {
    key: spec.key,
    version: "0.0.0-stub",
    inputSchema: stubInput,
    async run(ctx: AgentContext): Promise<AgentResult<{ note: string }>> {
      const note = `Agent '${spec.key}' is not implemented in Phase-2 MVP.`;
      // Audit the no-op (no other side effects).
      await ctx.audit({
        action: "agent.stub_invoked",
        entityType: "agent_runs",
        entityId: ctx.runId,
        reasoning: `${note} Purpose: ${spec.purpose}.`,
      });
      return {
        outputJson: { note },
        reasoningSummary: note,
        dataSources: [],
        confidence: 0,
        riskFlags: [],
        status: "needs_review",
      };
    },
  };
}

/** The 8 stub agents. */
export const stubAgents: Agent[] = STUB_SPECS.map(makeStub);

/** Keys of the stub agents (for tests). */
export const STUB_AGENT_KEYS = STUB_SPECS.map((s) => s.key);
