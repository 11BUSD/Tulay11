/**
 * Outreach Sequencing agent.
 *
 * Decides the next step/timing for a campaign and schedules follow-up DRAFT
 * tasks (never sends). For each contact with a `sent` message whose follow-up
 * window has elapsed, it:
 *   - skips suppressed contacts,
 *   - respects the throttle (min-gap, per-contact/campaign caps),
 *   - enqueues a follow-up `outreach-drafting` task (scheduled), and
 *   - stamps `follow_up_due_at` on the sent message.
 *
 * It writes only `agent_tasks` (scheduled) + `outreach_messages.follow_up_due_at`
 * — no message ever leaves DRAFT via this agent.
 */
import { z } from "zod";
import { uuidSchema } from "../../validation";
import type { Agent, AgentContext, AgentResult, DataSource } from "../types";
import { isContactSuppressed } from "../../outreach/suppression";
import { checkThrottle } from "../../outreach/throttle";
import { computeIdempotencyKey } from "../idempotency";

export const outreachSequencingInput = z.object({
  campaignId: uuidSchema,
  /** Follow-up delay applied when scheduling the next draft (ms). */
  followUpDelayMs: z
    .number()
    .int()
    .positive()
    .default(3 * 24 * 60 * 60 * 1000),
});
export type OutreachSequencingInput = z.infer<typeof outreachSequencingInput>;

export interface OutreachSequencingOutput {
  campaignId: string;
  scheduled: number;
  skipped: number;
  scheduledTaskIds: string[];
}

export const outreachSequencingAgent: Agent<
  OutreachSequencingInput,
  OutreachSequencingOutput
> = {
  key: "outreach-sequencing",
  version: "1.0.0",
  inputSchema: outreachSequencingInput,

  async run(
    ctx: AgentContext,
    input: OutreachSequencingInput,
  ): Promise<AgentResult<OutreachSequencingOutput>> {
    const sources: DataSource[] = [
      { kind: "db", ref: `outreach_campaigns:${input.campaignId}` },
    ];
    const now = ctx.now();

    // Sent messages in this campaign that have no reply and no follow-up yet.
    const sent = await ctx.db.query<{
      id: string;
      contact_id: string;
      sequence_step: number | null;
    }>(
      `select id, contact_id, sequence_step
         from outreach_messages
        where campaign_id = $1 and state = 'sent' and follow_up_due_at is null`,
      [input.campaignId],
    );

    const scheduledTaskIds: string[] = [];
    let skipped = 0;

    for (const msg of sent) {
      // Suppression.
      const suppression = await isContactSuppressed(msg.contact_id, { db: ctx.db });
      if (suppression.suppressed) {
        skipped++;
        continue;
      }
      // Throttle.
      const throttle = await checkThrottle(msg.contact_id, input.campaignId, {
        now,
        db: ctx.db,
      });
      if (!throttle.allowed) {
        skipped++;
        continue;
      }

      const nextStep = (msg.sequence_step ?? 0) + 1;
      const dueAt = new Date(now.getTime() + input.followUpDelayMs);

      // Enqueue a scheduled follow-up drafting task (idempotent per message+step).
      const followUpInput = {
        contactId: msg.contact_id,
        campaignId: input.campaignId,
        sequenceStep: nextStep,
      };
      const idem = `${computeIdempotencyKey(
        "outreach-drafting",
        msg.contact_id,
        followUpInput,
      )}::seq`;

      await ctx.db.transaction(async (tx) => {
        // Create a chained run + task for the follow-up draft.
        const dup = await tx.query<{ id: string }>(
          "select id from agent_runs where idempotency_key = $1",
          [idem],
        );
        let runId: string;
        if (dup[0]) {
          runId = dup[0].id;
        } else {
          const [run] = await tx.query<{ id: string }>(
            `insert into agent_runs
               (agent_key, agent_version, status, trigger_type, idempotency_key,
                input_json, related_contact_id, related_campaign_id)
             values ('outreach-drafting','1.0.0','queued','chained',$1,$2,$3,$4)
             returning id`,
            [
              idem,
              JSON.stringify(followUpInput),
              msg.contact_id,
              input.campaignId,
            ],
          );
          runId = run.id;
        }

        const [task] = await tx.query<{ id: string }>(
          `insert into agent_tasks
             (run_id, task_key, status, payload_json, idempotency_key, scheduled_for)
           values ($1,'outreach-drafting','queued',$2,$3,$4)
           on conflict (idempotency_key) do nothing
           returning id`,
          [
            runId,
            JSON.stringify(followUpInput),
            `${idem}::task`,
            dueAt.toISOString(),
          ],
        );
        if (task) scheduledTaskIds.push(task.id);

        // Stamp the follow-up window on the sent message.
        await tx.query(
          "update outreach_messages set follow_up_due_at=$2, updated_at=now() where id=$1",
          [msg.id, dueAt.toISOString()],
        );
      });
    }

    await ctx.audit({
      action: "agent.outreach_sequencing",
      entityType: "outreach_campaigns",
      entityId: input.campaignId,
      reasoning: `Scheduled ${scheduledTaskIds.length} follow-up draft task(s); skipped ${skipped} (suppressed/throttled). No messages sent.`,
      after: { scheduled: scheduledTaskIds.length, skipped },
    });

    return {
      outputJson: {
        campaignId: input.campaignId,
        scheduled: scheduledTaskIds.length,
        skipped,
        scheduledTaskIds,
      },
      reasoningSummary: `Sequencing: scheduled ${scheduledTaskIds.length} follow-up draft(s), skipped ${skipped}. Never sends.`,
      dataSources: sources,
      confidence: 1,
      riskFlags: [],
    };
  },
};
