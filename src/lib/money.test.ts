import { describe, expect, it } from "vitest";
import {
  applyPercentageBps,
  computeCommission,
  formatCents,
  splitCommission,
  type CommissionRuleLike,
} from "./money";

describe("applyPercentageBps", () => {
  it("computes integer cents from basis points", () => {
    expect(applyPercentageBps(10000, 1000)).toBe(1000); // 10% of $100
    expect(applyPercentageBps(5000, 250)).toBe(125); // 2.5% of $50
  });

  it("rounds to the nearest cent (half up)", () => {
    // 12345 * 1234 / 10000 = 1523.373 → 1523
    expect(applyPercentageBps(12345, 1234)).toBe(1523);
    // 3 * 5000 / 10000 = 1.5 → 2 (Math.round)
    expect(applyPercentageBps(3, 5000)).toBe(2);
  });

  it("rejects non-integer or negative input", () => {
    expect(() => applyPercentageBps(100.5, 1000)).toThrow(/integer/);
    expect(() => applyPercentageBps(-1, 1000)).toThrow(/>= 0/);
    expect(() => applyPercentageBps(100, -5)).toThrow(/>= 0/);
  });
});

describe("computeCommission", () => {
  it("fixed → value_cents", () => {
    const rule: CommissionRuleLike = {
      commission_type: "fixed",
      value_cents: 5000,
    };
    expect(computeCommission(rule, 99999)).toBe(5000);
  });

  it("percentage → applyPercentageBps(gross, bps)", () => {
    const rule: CommissionRuleLike = {
      commission_type: "percentage",
      percentage_bps: 1000,
    };
    expect(computeCommission(rule, 20000)).toBe(2000); // 10% of $200
  });

  it("recurring → per-period value, 0 beyond recurring_max_periods", () => {
    const rule: CommissionRuleLike = {
      commission_type: "recurring",
      value_cents: 1000,
      recurring_max_periods: 12,
    };
    expect(computeCommission(rule, 0, 1)).toBe(1000);
    expect(computeCommission(rule, 0, 12)).toBe(1000);
    expect(computeCommission(rule, 0, 13)).toBe(0);
  });

  it("manual → 0 (admin must set amount)", () => {
    const rule: CommissionRuleLike = { commission_type: "manual" };
    expect(computeCommission(rule, 50000)).toBe(0);
  });

  it("applies min/max clamps", () => {
    const rule: CommissionRuleLike = {
      commission_type: "percentage",
      percentage_bps: 1000,
      min_value_cents: 1500,
      max_value_cents: 1800,
    };
    expect(computeCommission(rule, 10000)).toBe(1500); // 1000 clamped up to 1500
    expect(computeCommission(rule, 200000)).toBe(1800); // 20000 clamped to 1800
    expect(computeCommission(rule, 17000)).toBe(1700); // within range
  });

  it("rejects non-integer/negative gross", () => {
    const rule: CommissionRuleLike = {
      commission_type: "percentage",
      percentage_bps: 1000,
    };
    expect(() => computeCommission(rule, 100.25)).toThrow(/integer/);
    expect(() => computeCommission(rule, -100)).toThrow(/>= 0/);
  });
});

describe("splitCommission", () => {
  it("splits with no cent lost", () => {
    const { ambassadorCents, remainderCents } = splitCommission(1000, 2000);
    expect(ambassadorCents).toBe(200);
    expect(remainderCents).toBe(800);
    expect(ambassadorCents + remainderCents).toBe(1000);
  });

  it("odd totals: remainder absorbs the rounding, sum preserved", () => {
    const total = 999;
    const { ambassadorCents, remainderCents } = splitCommission(total, 3333);
    // 999 * 3333 / 10000 = 332.967 → 333
    expect(ambassadorCents).toBe(333);
    expect(remainderCents).toBe(666);
    expect(ambassadorCents + remainderCents).toBe(total);
  });

  it("rejects invalid split", () => {
    expect(() => splitCommission(1000, 10001)).toThrow(/<= 10000/);
    expect(() => splitCommission(100.5, 2000)).toThrow(/integer/);
    expect(() => splitCommission(-1, 2000)).toThrow(/>= 0/);
  });
});

describe("formatCents", () => {
  it("formats CAD by default", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(10.5)).toThrow(/integer/);
  });
});
