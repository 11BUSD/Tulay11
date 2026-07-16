/**
 * Base agent types: the `Agent` contract, the `AgentContext` a run executes in,
 * and the structured `AgentResult` every agent returns.
 *
 * These are the single source of truth for the orchestration layer. Agents are
 * pure(-ish) units: given a validated input and a context (DB, LLM, audit hook,
 * clock, logger) they return an `AgentResult` — structured analysis plus
 * OPTIONAL drafts. Agents NEVER approve or send anything; the runner persists
 * their output and the human approval routes gate any external action.
 */
import type { ZodType } from "zod";
import type { ServiceDb } from "../db/client";
import type { LLMProvider } from "./llm/provider";

/** Where a piece of an agent's output came from (for traceability). */
export interface DataSource {
  kind: "db" | "llm" | "import" | "external";
  /** A stable reference: table:id, prompt tag, url, etc. */
  ref: string;
  note?: string;
}

/** A risk surfaced by an agent or a guardrail. `high` severity blocks. */
export interface RiskFlag {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

/**
 * A proposed outreach message. Agents may return drafts but can only ever mark
 * them `drafted` — the runner and routes enforce that approval/sending is a
 * separate, human-driven step.
 */
export interface OutreachDraft {
  contactId: string;
  campaignId: string;
  sequenceStep: number;
  subject: string;
  body: string;
  dedupeHash: string;
  riskFlags: RiskFlag[];
}

/** Structured result of an agent run. Persisted onto `agent_runs`. */
export interface AgentResult<O = unknown> {
  outputJson: O;
  reasoningSummary: string;
  dataSources: DataSource[];
  /** Confidence in [0, 1]. */
  confidence: number;
  riskFlags: RiskFlag[];
  /** Draft messages produced (never marked sent/approved). */
  drafts?: OutreachDraft[];
  /** Explicit terminal status; defaults to `succeeded` when omitted. */
  status?: "succeeded" | "needs_review";
}

/** Minimal structured logger the runner injects into a context. */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Audit entry an agent emits via `ctx.audit`. The context binds `agentRunId`
 * and forces `actorType='agent'`, so agents only supply the action/entity/why.
 * `reasoning` is required (agent audit rows must always be explainable).
 */
export interface AgentAuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  reasoning: string;
  before?: unknown;
  after?: unknown;
  sourceMeta?: Record<string, unknown> | null;
}

/** Execution context handed to `Agent.run`. */
export interface AgentContext {
  /** Transactional-capable data access (bound to the run's DB). */
  db: ServiceDb;
  /** LLM adapter (mock in test/CI). */
  llm: LLMProvider;
  /** The owning `agent_runs.id`. */
  runId: string;
  /** The admin/system actor that triggered the run, if any. */
  actorId?: string | null;
  /** Write an audit row bound to this run (actorType forced to `agent`). */
  audit(entry: AgentAuditEntry): Promise<void>;
  /** Injectable clock (deterministic in tests). */
  now(): Date;
  logger: Logger;
}

/** The contract every agent implements. */
export interface Agent<I = unknown, O = unknown> {
  key: string;
  version: string;
  /** zod schema validating the input at enqueue time. */
  inputSchema: ZodType<I>;
  run(ctx: AgentContext, input: I): Promise<AgentResult<O>>;
}
