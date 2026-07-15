import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenClaims,
  ForbiddenClaimError,
  scanForForbiddenClaims,
} from "./contentGuardrails";

describe("contentGuardrails", () => {
  const forbidden: Array<[string, string]> = [
    ["Tulay is a licensed mortgage brokerage in Ontario.", "regulatory_status"],
    ["We are FSRA-registered and ready to help.", "regulatory_status"],
    ["This offer is government approved for newcomers.", "government_approval"],
    ['"Best service ever!" - Maria', "testimonial"],
    ["Rated 5 stars by thousands of newcomers.", "testimonial"],
    ["Guaranteed approval regardless of your credit history.", "guarantee"],
    [
      "You should invest in this fund to maximize your returns.",
      "regulated_advice",
    ],
  ];

  it.each(forbidden)("blocks forbidden copy: %s", (text) => {
    expect(() => assertNoForbiddenClaims(text)).toThrow(ForbiddenClaimError);
  });

  it("attaches findings to the thrown error", () => {
    try {
      assertNoForbiddenClaims("We are FSRA-licensed brokers.");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenClaimError);
      const findings = (err as ForbiddenClaimError).findings;
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe("regulatory_status");
    }
  });

  it("allows compliant copy", () => {
    const ok =
      "Compare banking options for newcomers. Tulay may earn a referral fee if you sign up through a partner link.";
    expect(() => assertNoForbiddenClaims(ok)).not.toThrow();
    expect(scanForForbiddenClaims(ok)).toEqual([]);
  });

  it("handles empty input safely", () => {
    expect(scanForForbiddenClaims("")).toEqual([]);
    expect(assertNoForbiddenClaims("   ")).toEqual([]);
  });
});
