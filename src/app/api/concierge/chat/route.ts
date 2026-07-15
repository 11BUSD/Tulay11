/**
 * POST /api/concierge/chat — the settlement concierge (OpenAI-backed).
 *
 * Guardrails are enforced SERVER-SIDE so the UI can never be the only line of
 * defense:
 *   1. Regulated-topic gate: if the question is about a regulated pillar
 *      (insurance / tax / legal / immigration / financial — resolved via the
 *      settlement→disclaimer mapping and a keyword scan), we DO NOT ask the LLM
 *      for advice. We return a refusal + a `routeToPro` signal carrying the
 *      pillar disclaimer, so the client renders "talk to a licensed pro"
 *      instead of advice.
 *   2. For non-regulated topics we call the LLM through `getLLMProvider()`
 *      (the mock in test/CI/no-key, so tests never hit the network) and then
 *      run `assertNoForbiddenClaims` on the reply. If the model somehow emits a
 *      forbidden claim we strip it to a safe fallback rather than surfacing it.
 *
 * Non-streaming for simplicity + testability. Response shape:
 *   `{ reply, regulated, routeToPro? }`.
 */
import { NextResponse } from "next/server";
import { conciergeChatSchema } from "@/lib/validation";
import { getLLMProvider } from "@/lib/agents/llm/provider";
import {
  getDisclaimer,
  isRegulatedPillar,
  type Pillar,
} from "@/lib/compliance/disclaimers";
import { scanForForbiddenClaims } from "@/lib/compliance/contentGuardrails";
import { handleRouteError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

/** Settlement-pillar slug → the disclaimer pillar that governs it. */
const SETTLEMENT_TO_DISCLAIMER: Record<string, Pillar> = {
  tenant_insurance: "insurance",
  tax_benefits: "tax",
  remittance: "general",
};

/**
 * Keyword patterns that mark a message as touching a regulated topic even when
 * no pillar is supplied. Intentionally broad — a false positive routes the user
 * to a licensed pro, which is the safe failure.
 */
const REGULATED_KEYWORDS: { pattern: RegExp; pillar: Pillar }[] = [
  { pattern: /\binsuranc|coverage|premium|policy\b/i, pillar: "insurance" },
  { pattern: /\btax(es|ation)?|cra|deduction|refund|rrsp|tfsa\b/i, pillar: "tax" },
  { pattern: /\blegal|lawyer|paralegal|lawsuit|court\b/i, pillar: "legal" },
  {
    pattern: /\bimmigration|visa|permit|citizenship|pr card|refugee|asylum\b/i,
    pillar: "immigration",
  },
  {
    pattern: /\binvest|stock|mutual fund|portfolio|mortgage|refinanc|loan|credit card|line of credit\b/i,
    pillar: "investment",
  },
];

/** Resolve whether a message/pillar is regulated, and which disclaimer applies. */
function resolveRegulated(
  message: string,
  pillar?: string | null,
): { regulated: boolean; disclaimerPillar: Pillar } {
  if (pillar) {
    const mapped = SETTLEMENT_TO_DISCLAIMER[pillar];
    if (mapped && isRegulatedPillar(mapped)) {
      return { regulated: true, disclaimerPillar: mapped };
    }
    // A raw disclaimer-pillar slug may also be passed directly.
    if (isRegulatedPillar(pillar as Pillar)) {
      return { regulated: true, disclaimerPillar: pillar as Pillar };
    }
  }
  for (const rule of REGULATED_KEYWORDS) {
    if (rule.pattern.test(message) && isRegulatedPillar(rule.pillar)) {
      return { regulated: true, disclaimerPillar: rule.pillar };
    }
  }
  return { regulated: false, disclaimerPillar: "general" };
}

const SYSTEM_PROMPT =
  "You are Tulay's settlement concierge for newcomers to Ontario, Canada. " +
  "Give general, factual settlement information only (e.g. how a process works, " +
  "what documents are typically needed, where to go). Be warm and concise. " +
  "You must NEVER give legal, immigration, tax, insurance, or financial advice, " +
  "never claim Tulay is licensed/regulated/government-approved, and never invent " +
  "partner deals, guarantees, or testimonials. When a question needs a licensed " +
  "professional, say so and suggest connecting with one.";

const REGULATED_REFUSAL =
  "I can share general information, but I can't give advice on your specific " +
  "situation here — that depends on details only a licensed professional can " +
  "assess. Let's connect you with the right licensed help, at no cost where " +
  "government-funded services are available.";

const SAFE_FALLBACK =
  "I want to make sure I only share safe, general information. Could you " +
  "rephrase your question, or would you like me to connect you with a licensed " +
  "professional?";

/**
 * Deterministic general reply used when the mock LLM provider is active (tests
 * / CI / no API key). Keeps concierge output sensible without a network call.
 */
const SIMULATED_REPLY =
  "Here's some general information to get you started. I can walk you through " +
  "the typical steps and the documents usually involved. For anything specific " +
  "to your situation, I'll point you to the right service. What would you like " +
  "to know more about?";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await parseJson(req);
    const input = conciergeChatSchema.parse(body);

    const { regulated, disclaimerPillar } = resolveRegulated(
      input.message,
      input.pillar,
    );

    // Regulated topic → refuse advice, route to a licensed pro. No LLM call.
    if (regulated) {
      const disclaimer = getDisclaimer(disclaimerPillar);
      return NextResponse.json({
        reply: REGULATED_REFUSAL,
        regulated: true,
        routeToPro: {
          pillar: disclaimer.pillar,
          disclaimer: {
            pillar: disclaimer.pillar,
            regulator: disclaimer.regulator ?? null,
            body: disclaimer.body,
            requires_licensed_referral: disclaimer.requiresLicensedReferral,
          },
        },
      });
    }

    // Non-regulated → ask the LLM (mock in test/CI/no-key), then guardrail it.
    // The provider call hits an external network dependency (rate limits,
    // outages, timeouts). Never let its raw error surface to the client —
    // degrade to the safe fallback reply instead of a 500.
    const provider = getLLMProvider();
    let completion;
    try {
      completion = await provider.complete({
        promptTag: "concierge-chat",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: input.message },
        ],
      });
    } catch {
      return NextResponse.json({ reply: SAFE_FALLBACK, regulated: false });
    }

    // The mock provider (test/CI/no-key) has no concierge fixture and returns a
    // JSON echo, which is not a user-facing answer — substitute a clean, safe
    // general reply so dev/test output is sensible.
    let reply = completion.simulated
      ? SIMULATED_REPLY
      : completion.text?.trim() || SAFE_FALLBACK;

    // Server-side guardrail: if the model emitted a forbidden claim, do not
    // surface it — fall back to a safe response.
    if (scanForForbiddenClaims(reply).length > 0) {
      reply = SAFE_FALLBACK;
    }

    return NextResponse.json({ reply, regulated: false });
  } catch (err) {
    return handleRouteError(err);
  }
}
