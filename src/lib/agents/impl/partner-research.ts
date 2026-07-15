/**
 * Partner Research agent.
 *
 * Enriches a contact/partner with a firmographic + fit summary using the LLM
 * (mock in test/CI). It reads the `outreach_contacts` / `partners` records,
 * asks the LLM for an extraction, and returns structured output with cited
 * `data_sources`. It performs no external writes beyond audit + the run's own
 * output — enrichment is proposed, not force-applied. Low LLM confidence flows
 * through to a low run confidence (→ needs_review via the runner).
 */
import { z } from "zod";
import { uuidSchema } from "../../validation";
import type { Agent, AgentContext, AgentResult, DataSource } from "../types";

/** Input: one of contactId / partnerId. */
export const partnerResearchInput = z
  .object({
    contactId: uuidSchema.nullish(),
    partnerId: uuidSchema.nullish(),
  })
  .refine((v) => v.contactId != null || v.partnerId != null, {
    message: "contactId or partnerId is required",
  });
export type PartnerResearchInput = z.infer<typeof partnerResearchInput>;

export interface PartnerResearchOutput {
  partnerId: string | null;
  contactId: string | null;
  fitSummary: string;
  fitScore: number;
  firmographics: Record<string, unknown>;
  signals: string[];
}

export const partnerResearchAgent: Agent<
  PartnerResearchInput,
  PartnerResearchOutput
> = {
  key: "partner-research",
  version: "1.0.0",
  inputSchema: partnerResearchInput,

  async run(
    ctx: AgentContext,
    input: PartnerResearchInput,
  ): Promise<AgentResult<PartnerResearchOutput>> {
    const sources: DataSource[] = [];

    // Load the contact + partner records.
    let partnerId = input.partnerId ?? null;
    let contact: Record<string, unknown> | null = null;
    if (input.contactId) {
      const [row] = await ctx.db.query<Record<string, unknown>>(
        "select * from outreach_contacts where id = $1",
        [input.contactId],
      );
      contact = row ?? null;
      if (contact) {
        sources.push({
          kind: "db",
          ref: `outreach_contacts:${input.contactId}`,
        });
        if (!partnerId && contact.partner_id) {
          partnerId = String(contact.partner_id);
        }
      }
    }

    let partner: Record<string, unknown> | null = null;
    if (partnerId) {
      const [row] = await ctx.db.query<Record<string, unknown>>(
        "select * from partners where id = $1",
        [partnerId],
      );
      partner = row ?? null;
      if (partner) {
        sources.push({ kind: "db", ref: `partners:${partnerId}` });
      }
    }

    // Ask the LLM for an enrichment extraction (mock returns a fixture).
    const facts = {
      partner: partner
        ? {
            name: partner.name,
            category: partner.category,
            location: partner.location,
            filipino_focus: partner.filipino_focus,
            ontario_focus: partner.ontario_focus,
            languages_supported: partner.languages_supported,
          }
        : null,
      contact: contact
        ? { name: contact.name, role: contact.role, email: contact.email }
        : null,
    };
    const llm = await ctx.llm.complete({
      promptTag: "partner-research",
      json: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You enrich a business partner with firmographic + fit info for a " +
            "Filipino-newcomer settlement platform (Ontario, Canada). Only use " +
            "the supplied facts; do not fabricate. Return JSON.",
        },
        { role: "user", content: JSON.stringify(facts) },
      ],
    });
    sources.push({ kind: "llm", ref: "partner-research", note: llm.model });

    const parsed = (llm.parsed ?? {}) as Record<string, unknown>;
    const fitScore =
      typeof parsed.fitScore === "number" ? parsed.fitScore : 0.5;
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : fitScore;

    const output: PartnerResearchOutput = {
      partnerId,
      contactId: input.contactId ?? null,
      fitSummary:
        typeof parsed.fitSummary === "string"
          ? parsed.fitSummary
          : "No fit summary available.",
      fitScore,
      firmographics:
        (parsed.firmographics as Record<string, unknown>) ?? {},
      signals: Array.isArray(parsed.signals)
        ? (parsed.signals as string[])
        : [],
    };

    await ctx.audit({
      action: "agent.partner_research",
      entityType: partnerId ? "partners" : "outreach_contacts",
      entityId: partnerId ?? input.contactId ?? ctx.runId,
      reasoning: `Enriched via research: ${output.fitSummary}`,
      after: { fitScore: output.fitScore },
    });

    return {
      outputJson: output,
      reasoningSummary: `Research fit summary (score ${output.fitScore}): ${output.fitSummary}`,
      dataSources: sources,
      confidence,
      riskFlags:
        confidence < 0.4
          ? [
              {
                code: "low_research_confidence",
                severity: "medium",
                message: "Research confidence is low; verify facts manually.",
              },
            ]
          : [],
    };
  },
};
