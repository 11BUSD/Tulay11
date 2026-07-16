/**
 * Due Diligence agent.
 *
 * Vets a partner and produces a risk assessment + recommendation, writing a
 * `due_diligence_reviews` row. A high-risk verdict lands the run in
 * `needs_review` (the agent returns `status: 'needs_review'`). Sources are
 * required (the partner record + the LLM assessment) and audited.
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

export const dueDiligenceInput = z.object({
  partnerId: uuidSchema,
});
export type DueDiligenceInput = z.infer<typeof dueDiligenceInput>;

export interface DueDiligenceOutput {
  reviewId: string;
  partnerId: string;
  verdict: "pass" | "fail" | "needs_info";
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
  riskItems: RiskFlag[];
}

export const dueDiligenceAgent: Agent<DueDiligenceInput, DueDiligenceOutput> = {
  key: "due-diligence",
  version: "1.0.0",
  inputSchema: dueDiligenceInput,

  async run(
    ctx: AgentContext,
    input: DueDiligenceInput,
  ): Promise<AgentResult<DueDiligenceOutput>> {
    const sources: DataSource[] = [];

    const [partner] = await ctx.db.query<Record<string, unknown>>(
      "select * from partners where id = $1",
      [input.partnerId],
    );
    if (!partner) {
      throw new Error(`partners ${input.partnerId} not found`);
    }
    sources.push({ kind: "db", ref: `partners:${input.partnerId}` });

    // Prior research output (if any), for context.
    const research = await ctx.db.query<{ output_json: unknown }>(
      `select output_json from agent_runs
        where agent_key='partner-research' and related_partner_id=$1
          and status in ('succeeded','needs_review')
        order by created_at desc limit 1`,
      [input.partnerId],
    );
    if (research[0]) {
      sources.push({
        kind: "db",
        ref: `agent_runs:partner-research:${input.partnerId}`,
      });
    }

    const llm = await ctx.llm.complete({
      promptTag: "due-diligence",
      json: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You vet a prospective business partner. Assess risk (licensing, " +
            "reputation, fit) and give a verdict. Use only supplied facts. JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            partner: {
              name: partner.name,
              category: partner.category,
              licensed_required: partner.licensed_required,
              license_verified_at: partner.license_verified_at,
              regulator: partner.regulator,
            },
            research: research[0]?.output_json ?? null,
          }),
        },
      ],
    });
    sources.push({ kind: "llm", ref: "due-diligence", note: llm.model });

    const parsed = (llm.parsed ?? {}) as Record<string, unknown>;
    const verdict =
      parsed.verdict === "fail" || parsed.verdict === "needs_info"
        ? parsed.verdict
        : "pass";
    const riskLevel =
      parsed.riskLevel === "high" || parsed.riskLevel === "medium"
        ? parsed.riskLevel
        : "low";
    const recommendation =
      typeof parsed.recommendation === "string"
        ? parsed.recommendation
        : "No recommendation.";
    const rawItems = Array.isArray(parsed.riskItems)
      ? (parsed.riskItems as Record<string, unknown>[])
      : [];
    const riskItems: RiskFlag[] = rawItems.map((r) => ({
      code: String(r.code ?? "risk"),
      severity:
        r.severity === "high" || r.severity === "medium"
          ? (r.severity as "high" | "medium")
          : "low",
      message: String(r.message ?? ""),
    }));

    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0.6;

    // A regulated partner without a verified license is itself a high risk.
    if (partner.licensed_required && !partner.license_verified_at) {
      riskItems.push({
        code: "unverified_license",
        severity: "high",
        message:
          "Partner requires a license but none is verified; verify before surfacing offers.",
      });
    }

    const highRisk =
      riskLevel === "high" ||
      verdict === "fail" ||
      riskItems.some((r) => r.severity === "high");

    // Persist the DD review + audit in one transaction.
    const output = await ctx.db.transaction(async (tx) => {
      const [review] = await tx.query<{ id: string }>(
        `insert into due_diligence_reviews
           (partner_id, reviewer_id, outcome, checklist, notes, reviewed_at)
         values ($1,$2,$3,$4,$5,now())
         returning id`,
        [
          input.partnerId,
          null,
          verdict,
          JSON.stringify({ riskLevel, riskItems }),
          recommendation,
        ],
      );
      return {
        reviewId: review.id,
        partnerId: input.partnerId,
        verdict,
        riskLevel,
        recommendation,
        riskItems,
      } as DueDiligenceOutput;
    });

    await ctx.audit({
      action: "agent.due_diligence",
      entityType: "due_diligence_reviews",
      entityId: output.reviewId,
      reasoning: `DD verdict '${verdict}' (risk ${riskLevel}): ${recommendation}`,
      after: { verdict, riskLevel, review_id: output.reviewId },
    });

    return {
      outputJson: output,
      reasoningSummary: `Due diligence: verdict=${verdict}, risk=${riskLevel}. ${recommendation}`,
      dataSources: sources,
      confidence,
      riskFlags: riskItems,
      status: highRisk ? "needs_review" : undefined,
    };
  },
};
