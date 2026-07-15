/**
 * Deterministic mock LLM provider — no network.
 *
 * Keyed by `promptTag`, it returns fixed structured fixtures so agent logic is
 * exercised end-to-end in tests/CI without an API key or network access. When a
 * tag has no fixture it returns a generic, deterministic echo so unknown
 * prompts still resolve (never throwing, never calling out).
 */
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from "./provider";

/** Fixture payloads keyed by prompt tag. Values are the `parsed` JSON. */
const FIXTURES: Record<string, unknown> = {
  "partner-research": {
    fitSummary:
      "Newcomer-focused financial services provider serving the Filipino community in Ontario.",
    fitScore: 0.72,
    firmographics: {
      segment: "financial_services",
      region: "Ontario",
      audience: "newcomers",
    },
    signals: ["filipino_focus", "ontario_focus"],
    confidence: 0.72,
  },
  "due-diligence": {
    verdict: "pass",
    riskLevel: "low",
    riskItems: [
      {
        code: "licensing",
        severity: "low",
        message: "License status should be verified via the regulator registry.",
      },
    ],
    recommendation:
      "Proceed to outreach; verify licensing before surfacing regulated offers.",
    confidence: 0.68,
  },
  "outreach-drafting": {
    subject: "Partnership opportunity with Tulay",
    body:
      "Hello,\n\nI'm reaching out from Tulay, a platform helping Filipino newcomers settle in Ontario. " +
      "We think a partnership could help your customers access trusted local services. " +
      "Would you be open to a short call?\n\nIf you'd prefer not to hear from us, reply STOP to unsubscribe.\n\n" +
      "Tulay — Toronto, ON, Canada. hello@tulay.example",
    confidence: 0.6,
  },
};

/** Deterministic mock provider used in tests/CI. */
export class MockLLMProvider implements LLMProvider {
  async complete(req: LLMRequest): Promise<LLMResponse> {
    const fixture = FIXTURES[req.promptTag];
    if (fixture !== undefined) {
      return {
        text: JSON.stringify(fixture),
        parsed: req.json ? fixture : undefined,
        model: "mock",
        simulated: true,
      };
    }
    // Deterministic fallback: echo the last user message so unknown tags still
    // resolve without a network call.
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const echo = { echo: lastUser?.content ?? "", promptTag: req.promptTag };
    return {
      text: JSON.stringify(echo),
      parsed: req.json ? echo : undefined,
      model: "mock",
      simulated: true,
    };
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding derived from char codes; no network.
    const dims = 8;
    const vec = new Array<number>(dims).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % dims] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}
