/**
 * Outreach Drafting agent — DRAFT ONLY.
 *
 * Produces an `outreach_messages` row in state `drafted`. It NEVER sets
 * `approved`/`sent` (only the human approval routes do). It:
 *   - refuses to draft for a suppressed contact,
 *   - computes + stores the dedupe hash (a duplicate draft is rejected),
 *   - runs `caslCheck` and stores any blocking risk flags on the draft so the
 *     approval route will refuse to approve a non-compliant message.
 */
import { z } from "zod";
import { uuidSchema } from "../../validation";
import type {
  Agent,
  AgentContext,
  AgentResult,
  DataSource,
  RiskFlag,
} from "../types";
import { computeDedupeHash, isDuplicate, DuplicateDraftError } from "../../outreach/dedupe";
import { isContactSuppressed } from "../../outreach/suppression";
import { caslCheck } from "../guardrails";
import { recordAudit } from "../../audit";

export const outreachDraftingInput = z.object({
  contactId: uuidSchema,
  campaignId: uuidSchema,
  sequenceStep: z.number().int().min(0).default(0),
});
export type OutreachDraftingInput = z.infer<typeof outreachDraftingInput>;

export interface OutreachDraftingOutput {
  messageId: string | null;
  contactId: string;
  campaignId: string;
  sequenceStep: number;
  dedupeHash: string;
  state: "drafted";
  blocked: boolean;
}

export const outreachDraftingAgent: Agent<
  OutreachDraftingInput,
  OutreachDraftingOutput
> = {
  key: "outreach-drafting",
  version: "1.0.0",
  inputSchema: outreachDraftingInput,

  async run(
    ctx: AgentContext,
    input: OutreachDraftingInput,
  ): Promise<AgentResult<OutreachDraftingOutput>> {
    const sources: DataSource[] = [];

    // Suppression check — never draft for opted-out/bounced/unsubscribed.
    const suppression = await isContactSuppressed(input.contactId, { db: ctx.db });
    if (suppression.suppressed) {
      return {
        outputJson: {
          messageId: null,
          contactId: input.contactId,
          campaignId: input.campaignId,
          sequenceStep: input.sequenceStep,
          dedupeHash: "",
          state: "drafted",
          blocked: true,
        },
        reasoningSummary: `Contact suppressed (${suppression.reason}); no draft created.`,
        dataSources: [{ kind: "db", ref: `outreach_contacts:${input.contactId}` }],
        confidence: 1,
        riskFlags: [
          {
            code: "suppressed_contact",
            severity: "high",
            message: `Contact is suppressed (${suppression.reason}).`,
          },
        ],
        status: "needs_review",
      };
    }

    const [contact] = await ctx.db.query<Record<string, unknown>>(
      "select * from outreach_contacts where id = $1",
      [input.contactId],
    );
    if (!contact) throw new Error(`outreach_contacts ${input.contactId} not found`);
    sources.push({ kind: "db", ref: `outreach_contacts:${input.contactId}` });

    let partner: Record<string, unknown> | null = null;
    if (contact.partner_id) {
      const [row] = await ctx.db.query<Record<string, unknown>>(
        "select * from partners where id = $1",
        [contact.partner_id],
      );
      partner = row ?? null;
      if (partner) sources.push({ kind: "db", ref: `partners:${contact.partner_id}` });
    }

    const email = String(contact.email ?? "");
    const dedupeHash = computeDedupeHash(
      email,
      input.campaignId,
      input.sequenceStep,
    );
    if (await isDuplicate(dedupeHash, ctx.db)) {
      throw new DuplicateDraftError(dedupeHash);
    }

    // Generate the draft via the LLM (mock returns a CASL-clean fixture).
    const llm = await ctx.llm.complete({
      promptTag: "outreach-drafting",
      json: true,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Draft a CASL-compliant B2B partnership outreach email from Tulay. " +
            "Must include: Tulay sender identity + contact info, the reason for " +
            "outreach, a working opt-out, and no guaranteed-return/misleading " +
            "claims. Return JSON with subject + body.",
        },
        {
          role: "user",
          content: JSON.stringify({
            contact: { name: contact.name, role: contact.role },
            partner: partner ? { name: partner.name, category: partner.category } : null,
            sequenceStep: input.sequenceStep,
          }),
        },
      ],
    });
    sources.push({ kind: "llm", ref: "outreach-drafting", note: llm.model });

    const parsed = (llm.parsed ?? {}) as Record<string, unknown>;
    const subject =
      typeof parsed.subject === "string"
        ? parsed.subject
        : "Partnership opportunity with Tulay";
    const body =
      typeof parsed.body === "string"
        ? parsed.body
        : "Hello — reaching out from Tulay. Reply STOP to unsubscribe. Tulay, Toronto, ON.";
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0.6;

    // CASL check — any failure is a blocking risk flag stored on the draft.
    const caslFlags = caslCheck({ subject, body, senderName: "Tulay" });
    const blocked = caslFlags.length > 0;
    const riskFlags: RiskFlag[] = [...caslFlags];

    // Insert the DRAFT (state='drafted', never approved/sent).
    const messageId = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into outreach_messages
           (campaign_id, contact_id, direction, subject, body, state,
            draft_subject, draft_body, draft_reasoning, draft_confidence,
            draft_risk_flags, generated_by_run_id, sequence_step, dedupe_hash)
         values ($1,$2,'outbound',$3,$4,'drafted',$5,$6,$7,$8,$9,$10,$11,$12)
         returning id`,
        [
          input.campaignId,
          input.contactId,
          subject,
          body,
          subject,
          body,
          `Drafted by outreach-drafting agent (step ${input.sequenceStep}).`,
          confidence,
          JSON.stringify(riskFlags),
          ctx.runId,
          input.sequenceStep,
          dedupeHash,
        ],
      );
      // Audit the drafted state (agent action).
      await recordAudit(
        {
          actorId: ctx.actorId ?? null,
          actorType: "agent",
          action: "outreach.state.drafted",
          entityType: "outreach_messages",
          entityId: row.id,
          after: { state: "drafted", blocked },
          reasoning: `Drafted outreach to contact ${input.contactId} (step ${input.sequenceStep}). CASL blocking flags: ${caslFlags.length}.`,
          agentRunId: ctx.runId,
        },
        tx,
      );
      return row.id;
    });

    const output: OutreachDraftingOutput = {
      messageId,
      contactId: input.contactId,
      campaignId: input.campaignId,
      sequenceStep: input.sequenceStep,
      dedupeHash,
      state: "drafted",
      blocked,
    };

    return {
      outputJson: output,
      reasoningSummary: blocked
        ? `Draft created but blocked by ${caslFlags.length} CASL flag(s); cannot be approved until fixed.`
        : "CASL-clean outreach draft created (state=drafted).",
      dataSources: sources,
      confidence,
      riskFlags,
      drafts: [
        {
          contactId: input.contactId,
          campaignId: input.campaignId,
          sequenceStep: input.sequenceStep,
          subject,
          body,
          dedupeHash,
          riskFlags,
        },
      ],
      status: blocked ? "needs_review" : undefined,
    };
  },
};
