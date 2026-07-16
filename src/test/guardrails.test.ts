/**
 * Agent guardrails tests — pure functions, no DB/LLM.
 *   - assertNoInventedTerms: sourced term passes, unsourced throws / flags,
 *   - caslCheck: missing sender/reason/opt-out + misleading claims flagged,
 *   - resolveStatus: low confidence or high flag → needs_review.
 */
import { describe, expect, it } from "vitest";
import {
  assertNoInventedTerms,
  InventedTermError,
  caslCheck,
  resolveStatus,
  hasBlockingRiskFlag,
} from "@/lib/agents/guardrails";
import type { DataSource } from "@/lib/agents/types";

const ddSource: DataSource = {
  kind: "db",
  ref: "partner_agreements:abc",
  note: "commission_type fixed; commission_value_cents 5000",
};

describe("assertNoInventedTerms", () => {
  it("passes when every term maps to a DD/agreement source", () => {
    const flags = assertNoInventedTerms(
      [
        { term: "commission_type", value: "fixed" },
        { term: "commission_value_cents", value: 5000 },
      ],
      [ddSource],
    );
    expect(flags).toEqual([]);
  });

  it("throws on an unsourced term (strict mode)", () => {
    expect(() =>
      assertNoInventedTerms(
        [{ term: "signing_bonus_cents", value: 99999 }],
        [ddSource],
      ),
    ).toThrow(InventedTermError);
  });

  it("returns high-severity flags in lenient mode", () => {
    const flags = assertNoInventedTerms(
      [{ term: "signing_bonus_cents", value: 99999 }],
      [ddSource],
      { lenient: true },
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].severity).toBe("high");
    expect(hasBlockingRiskFlag(flags)).toBe(true);
  });

  it("ignores non-db / non-DD sources when matching", () => {
    expect(() =>
      assertNoInventedTerms(
        [{ term: "commission_type", value: "fixed" }],
        [{ kind: "llm", ref: "partner-research", note: "commission_type fixed" }],
      ),
    ).toThrow(InventedTermError);
  });
});

describe("caslCheck", () => {
  const cleanBody =
    "Hello, I'm reaching out from Tulay about a partnership opportunity. " +
    "Reply STOP to unsubscribe. Tulay, Toronto, ON.";

  it("passes a compliant draft (no flags)", () => {
    expect(caslCheck({ subject: "Partnership", body: cleanBody })).toEqual([]);
  });

  it("flags a missing sender identity", () => {
    const flags = caslCheck({
      body: "Reaching out about a partnership opportunity. Unsubscribe here.",
      senderName: "Tulay",
    });
    expect(flags.map((f) => f.code)).toContain("casl_missing_sender_identity");
  });

  it("flags a missing opt-out", () => {
    const flags = caslCheck({
      body: "Hi from Tulay — a partnership opportunity for you.",
    });
    expect(flags.map((f) => f.code)).toContain("casl_missing_optout");
  });

  it("flags a missing reason for outreach", () => {
    const flags = caslCheck({
      body: "Hello from Tulay. Reply STOP to unsubscribe.",
    });
    expect(flags.map((f) => f.code)).toContain("casl_missing_reason");
  });

  it("flags misleading / guaranteed-return claims", () => {
    const flags = caslCheck({
      body:
        "Tulay reaching out about a partnership. We guarantee approval and returns. Unsubscribe anytime.",
    });
    expect(flags.some((f) => f.code.startsWith("casl_misleading_"))).toBe(true);
  });
});

describe("resolveStatus", () => {
  it("needs_review below the confidence floor", () => {
    expect(resolveStatus(0.2, [])).toBe("needs_review");
  });
  it("needs_review with a high-severity flag", () => {
    expect(
      resolveStatus(0.9, [{ code: "x", severity: "high", message: "y" }]),
    ).toBe("needs_review");
  });
  it("succeeded when confident + no blocking flags", () => {
    expect(
      resolveStatus(0.9, [{ code: "x", severity: "low", message: "y" }]),
    ).toBe("succeeded");
  });
});
