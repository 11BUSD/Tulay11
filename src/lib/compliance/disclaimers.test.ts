import { describe, expect, it } from "vitest";
import {
  getDisclaimer,
  isRegulatedPillar,
  REGULATED_PILLARS,
  type Pillar,
} from "./disclaimers";

describe("getDisclaimer", () => {
  it("returns requiresLicensedReferral=true for every regulated pillar", () => {
    for (const pillar of REGULATED_PILLARS) {
      const cfg = getDisclaimer(pillar);
      expect(cfg.pillar).toBe(pillar);
      expect(cfg.requiresLicensedReferral).toBe(true);
      expect(cfg.body.length).toBeGreaterThan(0);
    }
  });

  it("general pillar is affiliate-disclosure, not licensed", () => {
    const cfg = getDisclaimer("general");
    expect(cfg.requiresLicensedReferral).toBe(false);
    expect(cfg.body.toLowerCase()).toContain("referral fee");
  });

  it("regulated pillars carry a regulator", () => {
    expect(getDisclaimer("mortgage").regulator).toBe("FSRA");
    expect(getDisclaimer("insurance").regulator).toBe("FSRA");
    expect(getDisclaimer("legal").regulator).toBeTruthy();
  });

  it("falls back to general for an unknown pillar", () => {
    const cfg = getDisclaimer("nope" as unknown as Pillar);
    expect(cfg.pillar).toBe("general");
    expect(cfg.requiresLicensedReferral).toBe(false);
  });

  it("isRegulatedPillar reflects the regulated set", () => {
    expect(isRegulatedPillar("credit")).toBe(true);
    expect(isRegulatedPillar("general")).toBe(false);
  });
});
