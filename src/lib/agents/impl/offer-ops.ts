/**
 * Offer Ops agent.
 *
 * Turns approved partner terms into a proposed `partner_offers` row in status
 * `pending` (never auto-live — an admin must approve to go live). It reads the
 * partner's `partner_agreements` + `due_diligence_reviews` and applies
 * `assertNoInventedTerms`: any commission/offer term NOT traceable to a stored
 * agreement/DD source is blocked with a high-severity risk flag and no offer is
 * created. All money is integer cents.
 */
import { z } from "zod";
import { uuidSchema, centsSchema } from "../../validation";
import type {
  Agent,
  AgentContext,
  AgentResult,
  DataSource,
  RiskFlag,
} from "../types";
import { assertNoInventedTerms, type AssertedTerm } from "../guardrails";

export const offerOpsInput = z.object({
  partnerId: uuidSchema,
  agreementId: uuidSchema.nullish(),
  /** The proposed offer terms (must trace to stored sources). */
  offer: z.object({
    title: z.string().min(1),
    settlement_pillar: z.string().min(1),
    offer_type: z
      .enum([
        "referral",
        "affiliate_link",
        "coupon",
        "manual_intro",
        "lead_form",
        "sponsored",
      ])
      .default("referral"),
    commission_type: z
      .enum(["fixed", "percentage", "recurring", "manual"])
      .default("fixed"),
    commission_value_cents: centsSchema.default(0),
    user_reward_value_cents: centsSchema.default(0),
    destination_url: z.string().nullish(),
  }),
});
export type OfferOpsInput = z.infer<typeof offerOpsInput>;

export interface OfferOpsOutput {
  offerId: string | null;
  partnerId: string;
  status: "pending";
  blocked: boolean;
  blockedTerms: string[];
}

export const offerOpsAgent: Agent<OfferOpsInput, OfferOpsOutput> = {
  key: "offer-ops",
  version: "1.0.0",
  inputSchema: offerOpsInput,

  async run(
    ctx: AgentContext,
    input: OfferOpsInput,
  ): Promise<AgentResult<OfferOpsOutput>> {
    const sources: DataSource[] = [];

    // Load stored agreements (source of truth for terms).
    const agreements = await ctx.db.query<Record<string, unknown>>(
      input.agreementId
        ? "select * from partner_agreements where id = $1"
        : "select * from partner_agreements where partner_id = $1 order by created_at desc",
      [input.agreementId ?? input.partnerId],
    );
    for (const a of agreements) {
      sources.push({
        kind: "db",
        ref: `partner_agreements:${a.id}`,
        note: String(a.terms_summary ?? ""),
      });
    }

    const dd = await ctx.db.query<Record<string, unknown>>(
      "select * from due_diligence_reviews where partner_id = $1 order by created_at desc",
      [input.partnerId],
    );
    for (const r of dd) {
      sources.push({
        kind: "db",
        ref: `due_diligence_reviews:${r.id}`,
        note: `${r.notes ?? ""} ${JSON.stringify(r.checklist ?? {})}`,
      });
    }

    // Which terms must trace to a source? The concrete commission/offer terms.
    const assertedTerms: AssertedTerm[] = [
      { term: "commission_type", value: input.offer.commission_type },
      { term: "commission_value_cents", value: input.offer.commission_value_cents },
      { term: input.offer.offer_type, value: input.offer.offer_type },
    ];

    // Lenient mode: collect risk flags rather than throwing, so we can decide.
    const inventedFlags = assertNoInventedTerms(assertedTerms, sources, {
      lenient: true,
    });
    const blocked = inventedFlags.length > 0;
    const blockedTerms = inventedFlags.map((f) =>
      f.message.replace(/^Term '(.*?)'.*$/, "$1"),
    );

    if (blocked) {
      const riskFlags: RiskFlag[] = inventedFlags;
      await ctx.audit({
        action: "agent.offer_ops_blocked",
        entityType: "partners",
        entityId: input.partnerId,
        reasoning: `Offer creation blocked: term(s) not backed by a stored agreement/DD source: ${blockedTerms.join(", ")}.`,
        after: { blocked: true, blockedTerms },
      });
      return {
        outputJson: {
          offerId: null,
          partnerId: input.partnerId,
          status: "pending",
          blocked: true,
          blockedTerms,
        },
        reasoningSummary: `Blocked: unsourced term(s) ${blockedTerms.join(", ")}. No offer created.`,
        dataSources: sources,
        confidence: 0.9,
        riskFlags,
        status: "needs_review",
      };
    }

    // Ensure integer cents (schema already enforces int/nonneg, but assert).
    if (
      !Number.isInteger(input.offer.commission_value_cents) ||
      !Number.isInteger(input.offer.user_reward_value_cents)
    ) {
      throw new Error("Offer amounts must be integer cents");
    }

    // Create the pending offer (never auto-live).
    const offer = await ctx.db.transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into partner_offers
           (partner_id, title, settlement_pillar, offer_type, destination_url,
            commission_type, commission_value_cents, user_reward_value_cents,
            active, status, source_agreement_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,false,'pending',$9)
         returning id`,
        [
          input.partnerId,
          input.offer.title,
          input.offer.settlement_pillar,
          input.offer.offer_type,
          input.offer.destination_url ?? null,
          input.offer.commission_type,
          input.offer.commission_value_cents,
          input.offer.user_reward_value_cents,
          input.agreementId ?? agreements[0]?.id ?? null,
        ],
      );
      return row;
    });

    await ctx.audit({
      action: "agent.offer_ops",
      entityType: "partner_offers",
      entityId: offer.id,
      reasoning: `Proposed pending offer '${input.offer.title}' from stored terms (status=pending, not live).`,
      after: { offer_id: offer.id, status: "pending" },
    });

    return {
      outputJson: {
        offerId: offer.id,
        partnerId: input.partnerId,
        status: "pending",
        blocked: false,
        blockedTerms: [],
      },
      reasoningSummary: `Created pending offer '${input.offer.title}' (integer cents; admin approval required to go live).`,
      dataSources: sources,
      confidence: 0.85,
      riskFlags: [],
    };
  },
};
