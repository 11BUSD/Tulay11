/**
 * AgentRunner — the DB-backed orchestration engine.
 *
 * Responsibilities:
 *   - `enqueue(agentKey, input, opts)` — validate the input against the agent's
 *     schema, compute a deterministic `idempotency_key = hash(agentKey + entityId
 *     + inputHash)`, and upsert an `agent_runs` row + a first `agent_tasks` row.
 *     A duplicate idempotency key is a NO-OP that returns the existing run — no
 *     double work, no duplicate drafts.
 *   - `claim(n)` — atomically claim up to `n` queued/expired-lock tasks via
 *     `UPDATE ... FOR UPDATE SKIP LOCKED`, setting `locked_at`/`lock_expires_at`.
 *     Expired locks are reclaimable so a dead worker's task resumes.
 *   - `execute(taskId)` — load the agent from the registry, run it, persist
 *     output/reasoning/sources/confidence/risk to `agent_runs`, and audit start
 *     + finish (agent rows carry reasoning). On throw: increment `attempt`,
 *     record the error, requeue until `max_attempts`, then mark the task `dead`
 *     and the run `failed`. Releases the lock in all cases.
 *   - `override(runId, patch)` — admin manual override (force status / edit
 *     output), always audited as a human action.
 *
 * Side effects inside an agent are guarded by the run's idempotency + the
 * agent's own dedupe keys, so a re-run after an expired lock does not duplicate
 * work.
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { computeIdempotencyKey } from "./idempotency";

export { computeIdempotencyKey } from "./idempotency";
import { recordAudit } from "../audit";
import { getLLMProvider, type LLMProvider } from "./llm/provider";
import { getAgent } from "./registry";
import { resolveStatus } from "./guardrails";
import type {
  AgentAuditEntry,
  AgentContext,
  AgentResult,
  Logger,
} from "./types";

/** Default lock lease for a claimed task. */
export const DEFAULT_LOCK_MS = 10 * 60 * 1000;

/** An `agent_runs` row (subset used by the runner). */
export interface AgentRunRow {
  id: string;
  agent_key: string;
  agent_version: string | null;
  status: string;
  trigger_type: string | null;
  triggered_by: string | null;
  idempotency_key: string | null;
  input_json: unknown;
  output_json: unknown;
  reasoning_summary: string | null;
  data_sources: unknown;
  confidence: string | null;
  risk_flags: unknown;
  related_partner_id: string | null;
  related_contact_id: string | null;
  related_campaign_id: string | null;
  attempt: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/** An `agent_tasks` row. */
export interface AgentTaskRow {
  id: string;
  run_id: string;
  task_key: string;
  status: string;
  payload_json: unknown;
  result_json: unknown;
  idempotency_key: string | null;
  attempt: number;
  max_attempts: number;
  scheduled_for: string | null;
  locked_at: string | null;
  locked_by: string | null;
  lock_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Options for `enqueue`. */
export interface EnqueueOptions {
  /** Entity the run is about (partner/contact/campaign id) — feeds idempotency. */
  entityId?: string | null;
  triggerType?: "manual" | "scheduled" | "chained";
  triggeredBy?: string | null;
  relatedPartnerId?: string | null;
  relatedContactId?: string | null;
  relatedCampaignId?: string | null;
  /** When the first task becomes eligible (defaults to now). */
  scheduledFor?: Date | null;
  db?: ServiceDb;
}

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** The orchestration engine. Stateless apart from an optional injected DB. */
export class AgentRunner {
  private readonly db: ServiceDb;
  private readonly llm: LLMProvider;
  private readonly workerId: string;
  private readonly logger: Logger;

  constructor(opts: {
    db?: ServiceDb;
    llm?: LLMProvider;
    workerId?: string;
    logger?: Logger;
  } = {}) {
    this.db = opts.db ?? getServiceDb();
    this.llm = opts.llm ?? getLLMProvider();
    this.workerId = opts.workerId ?? `worker-${process.pid}`;
    this.logger = opts.logger ?? noopLogger;
  }

  /**
   * Validate + enqueue an agent run. Returns the existing run (no new work) when
   * an identical idempotency key already exists.
   */
  async enqueue(
    agentKey: string,
    input: unknown,
    opts: EnqueueOptions = {},
  ): Promise<{ run: AgentRunRow; task: AgentTaskRow; deduped: boolean }> {
    const agent = getAgent(agentKey);
    // Validate input up front (throws ZodError on bad input).
    const parsed = agent.inputSchema.parse(input);

    const idempotencyKey = computeIdempotencyKey(
      agentKey,
      opts.entityId,
      parsed,
    );
    const db = opts.db ?? this.db;

    // Fast path: an existing run for this key is a no-op.
    const existing = await db.query<AgentRunRow>(
      "select * from agent_runs where idempotency_key = $1",
      [idempotencyKey],
    );
    if (existing[0]) {
      const [task] = await db.query<AgentTaskRow>(
        "select * from agent_tasks where run_id = $1 order by created_at asc limit 1",
        [existing[0].id],
      );
      return { run: existing[0], task, deduped: true };
    }

    return db.transaction(async (tx) => {
      // Re-check inside the tx to close the race; unique constraint is the
      // ultimate guard.
      const dup = await tx.query<AgentRunRow>(
        "select * from agent_runs where idempotency_key = $1",
        [idempotencyKey],
      );
      if (dup[0]) {
        const [task] = await tx.query<AgentTaskRow>(
          "select * from agent_tasks where run_id = $1 order by created_at asc limit 1",
          [dup[0].id],
        );
        return { run: dup[0], task, deduped: true };
      }

      const [run] = await tx.query<AgentRunRow>(
        `insert into agent_runs
           (agent_key, agent_version, status, trigger_type, triggered_by,
            idempotency_key, input_json, related_partner_id, related_contact_id,
            related_campaign_id)
         values ($1,$2,'queued',$3,$4,$5,$6,$7,$8,$9)
         returning *`,
        [
          agent.key,
          agent.version,
          opts.triggerType ?? "manual",
          opts.triggeredBy ?? null,
          idempotencyKey,
          JSON.stringify(parsed),
          opts.relatedPartnerId ?? null,
          opts.relatedContactId ?? null,
          opts.relatedCampaignId ?? null,
        ],
      );

      const taskIdemKey = `${idempotencyKey}::t0`;
      const [task] = await tx.query<AgentTaskRow>(
        `insert into agent_tasks
           (run_id, task_key, status, payload_json, idempotency_key, scheduled_for)
         values ($1,$2,'queued',$3,$4,$5)
         returning *`,
        [
          run.id,
          agent.key,
          JSON.stringify(parsed),
          taskIdemKey,
          (opts.scheduledFor ?? new Date()).toISOString(),
        ],
      );

      await recordAudit(
        {
          actorId: opts.triggeredBy ?? null,
          actorType: opts.triggeredBy ? "human" : "system",
          action: "agent.enqueued",
          entityType: "agent_runs",
          entityId: run.id,
          after: { agent_key: agent.key, status: "queued" },
        },
        tx,
      );

      return { run, task, deduped: false };
    });
  }

  /**
   * Atomically claim up to `limit` eligible tasks. Eligible = `queued` and due,
   * OR `running` with an expired lock (reclaimable). Sets the lock lease.
   */
  async claim(
    limit = 1,
    opts: { now?: Date; lockMs?: number; db?: ServiceDb } = {},
  ): Promise<AgentTaskRow[]> {
    const db = opts.db ?? this.db;
    const now = opts.now ?? new Date();
    const lockMs = opts.lockMs ?? DEFAULT_LOCK_MS;
    const expires = new Date(now.getTime() + lockMs);

    return db.transaction(async (tx) => {
      const claimable = await tx.query<{ id: string }>(
        `select id from agent_tasks
           where status in ('queued','running')
             and (scheduled_for is null or scheduled_for <= $1)
             and (
               status = 'queued'
               or (status = 'running' and lock_expires_at is not null and lock_expires_at < $1)
             )
           order by created_at asc
           for update skip locked
           limit $2`,
        [now.toISOString(), limit],
      );
      if (claimable.length === 0) return [];

      const ids = claimable.map((r) => r.id);
      const claimed = await tx.query<AgentTaskRow>(
        `update agent_tasks
           set status='running', locked_by=$1, locked_at=$2, lock_expires_at=$3,
               updated_at=now()
         where id = any($4::uuid[])
         returning *`,
        [this.workerId, now.toISOString(), expires.toISOString(), ids],
      );
      return claimed;
    });
  }

  /** Build the `AgentContext` bound to a run + the runner's db/llm. */
  private buildContext(
    runId: string,
    actorId: string | null,
    db: ServiceDb,
    now: () => Date,
  ): AgentContext {
    return {
      db,
      llm: this.llm,
      runId,
      actorId,
      logger: this.logger,
      now,
      audit: async (entry: AgentAuditEntry) => {
        await recordAudit(
          {
            actorId,
            actorType: "agent",
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before,
            after: entry.after,
            reasoning: entry.reasoning,
            sourceMeta: entry.sourceMeta ?? null,
            agentRunId: runId,
          },
          db,
        );
      },
    };
  }

  /**
   * Execute a claimed task: run the agent, persist its result, audit start +
   * finish. On error, increment attempt and requeue (or dead/failed at
   * max_attempts). Lock is released in all outcomes.
   */
  async execute(
    taskId: string,
    opts: { now?: Date; db?: ServiceDb } = {},
  ): Promise<AgentRunRow> {
    const db = opts.db ?? this.db;
    const now = opts.now ?? new Date();
    const nowFn = () => opts.now ?? new Date();

    const [task] = await db.query<AgentTaskRow>(
      "select * from agent_tasks where id = $1",
      [taskId],
    );
    if (!task) throw new Error(`agent_tasks ${taskId} not found`);

    const [run] = await db.query<AgentRunRow>(
      "select * from agent_runs where id = $1",
      [task.run_id],
    );
    if (!run) throw new Error(`agent_runs ${task.run_id} not found`);

    const agent = getAgent(run.agent_key);
    const input = agent.inputSchema.parse(run.input_json);
    const actorId = run.triggered_by;

    // Mark run running + audit start.
    await db.query(
      "update agent_runs set status='running', started_at=coalesce(started_at,$2), updated_at=now() where id=$1",
      [run.id, now.toISOString()],
    );
    await recordAudit(
      {
        actorId,
        actorType: "agent",
        action: "agent.run_started",
        entityType: "agent_runs",
        entityId: run.id,
        reasoning: `Starting agent '${run.agent_key}' (attempt ${task.attempt + 1}).`,
        agentRunId: run.id,
      },
      db,
    );

    try {
      const ctx = this.buildContext(run.id, actorId, db, nowFn);
      const result: AgentResult = await agent.run(ctx, input);
      const status =
        result.status ?? resolveStatus(result.confidence, result.riskFlags);

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.query<AgentRunRow>(
          `update agent_runs
             set status=$2, output_json=$3, reasoning_summary=$4, data_sources=$5,
                 confidence=$6, risk_flags=$7, error=null, finished_at=$8, updated_at=now()
           where id=$1
           returning *`,
          [
            run.id,
            status,
            JSON.stringify(result.outputJson ?? null),
            result.reasoningSummary,
            JSON.stringify(result.dataSources ?? []),
            result.confidence,
            JSON.stringify(result.riskFlags ?? []),
            now.toISOString(),
          ],
        );
        await tx.query(
          `update agent_tasks
             set status='succeeded', result_json=$2, locked_by=null, locked_at=null,
                 lock_expires_at=null, updated_at=now()
           where id=$1`,
          [task.id, JSON.stringify(result.outputJson ?? null)],
        );
        await recordAudit(
          {
            actorId,
            actorType: "agent",
            action: "agent.run_finished",
            entityType: "agent_runs",
            entityId: run.id,
            after: { status, confidence: result.confidence },
            reasoning: result.reasoningSummary || "Agent run finished.",
            agentRunId: run.id,
          },
          tx,
        );
        return row;
      });
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempt = task.attempt + 1;
      const exhausted = nextAttempt >= task.max_attempts;

      const updated = await db.transaction(async (tx) => {
        await tx.query(
          `update agent_tasks
             set status=$2, attempt=$3, locked_by=null, locked_at=null,
                 lock_expires_at=null, updated_at=now()
           where id=$1`,
          [task.id, exhausted ? "dead" : "queued", nextAttempt],
        );
        const [row] = await tx.query<AgentRunRow>(
          `update agent_runs
             set status=$2, error=$3, attempt=$4, updated_at=now()
           where id=$1
           returning *`,
          [run.id, exhausted ? "failed" : "queued", message, nextAttempt],
        );
        await recordAudit(
          {
            actorId,
            actorType: "agent",
            action: exhausted ? "agent.run_failed" : "agent.run_retry",
            entityType: "agent_runs",
            entityId: run.id,
            after: { attempt: nextAttempt, error: message },
            reasoning: exhausted
              ? `Agent '${run.agent_key}' failed after ${nextAttempt} attempt(s): ${message}`
              : `Agent '${run.agent_key}' errored (attempt ${nextAttempt}); requeued: ${message}`,
            agentRunId: run.id,
          },
          tx,
        );
        return row;
      });
      return updated;
    }
  }

  /** Convenience: claim + execute up to `limit` tasks (cron drain). */
  async tick(
    limit = 5,
    opts: { now?: Date; db?: ServiceDb } = {},
  ): Promise<AgentRunRow[]> {
    const claimed = await this.claim(limit, opts);
    const out: AgentRunRow[] = [];
    for (const task of claimed) {
      out.push(await this.execute(task.id, opts));
    }
    return out;
  }

  /**
   * Admin manual override of a run — force a status and/or patch the output.
   * Always audited as a human action.
   */
  async override(
    runId: string,
    patch: {
      status?: string;
      outputJson?: unknown;
      reasoningSummary?: string;
      actorId: string;
      reason: string;
    },
    opts: { db?: ServiceDb } = {},
  ): Promise<AgentRunRow> {
    const db = opts.db ?? this.db;
    if (!patch.actorId) {
      throw new Error("override requires a human actorId");
    }
    return db.transaction(async (tx) => {
      const [before] = await tx.query<AgentRunRow>(
        "select * from agent_runs where id = $1",
        [runId],
      );
      if (!before) throw new Error(`agent_runs ${runId} not found`);

      const sets: string[] = [];
      const params: unknown[] = [runId];
      if (patch.status !== undefined) {
        params.push(patch.status);
        sets.push(`status=$${params.length}`);
      }
      if (patch.outputJson !== undefined) {
        params.push(JSON.stringify(patch.outputJson));
        sets.push(`output_json=$${params.length}`);
      }
      if (patch.reasoningSummary !== undefined) {
        params.push(patch.reasoningSummary);
        sets.push(`reasoning_summary=$${params.length}`);
      }
      sets.push("updated_at=now()");

      const [row] = await tx.query<AgentRunRow>(
        `update agent_runs set ${sets.join(", ")} where id=$1 returning *`,
        params,
      );
      await recordAudit(
        {
          actorId: patch.actorId,
          actorType: "human",
          action: "agent.override",
          entityType: "agent_runs",
          entityId: runId,
          before: { status: before.status },
          after: { status: patch.status ?? before.status },
          reasoning: patch.reason,
        },
        tx,
      );
      return row;
    });
  }
}
