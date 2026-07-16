import { describe, expect, it } from "vitest";
import { buildRedirectUrl, generateReferralId, hashIp } from "./referral";

describe("generateReferralId", () => {
  it("produces a url-safe token", () => {
    const id = generateReferralId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet, no padding
    expect(id.length).toBeGreaterThanOrEqual(20);
  });

  it("is (practically) unique across many generations", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateReferralId()));
    expect(set.size).toBe(1000);
  });
});

describe("hashIp", () => {
  it("is deterministic and never returns the raw ip", () => {
    const ip = "198.51.100.23";
    expect(hashIp(ip)).toBe(hashIp(ip));
    expect(hashIp(ip)).not.toContain(ip);
    expect(hashIp(ip).startsWith("v1:")).toBe(true);
  });
});

describe("buildRedirectUrl", () => {
  it("appends tracking params", () => {
    const url = buildRedirectUrl("https://example.com/sample", {
      referral_id: "abc123",
      tracking_code: "SEED-banking-01",
      utm_source: "tulay",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("referral_id")).toBe("abc123");
    expect(parsed.searchParams.get("tracking_code")).toBe("SEED-banking-01");
    expect(parsed.searchParams.get("utm_source")).toBe("tulay");
  });

  it("preserves an existing query string on the destination", () => {
    const url = buildRedirectUrl("https://example.com/p?ref=keep&x=1", {
      referral_id: "abc123",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe("keep");
    expect(parsed.searchParams.get("x")).toBe("1");
    expect(parsed.searchParams.get("referral_id")).toBe("abc123");
  });

  it("omits empty/undefined params", () => {
    const url = buildRedirectUrl("https://example.com/", {
      referral_id: "abc123",
      utm_source: "",
      utm_medium: undefined,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has("utm_source")).toBe(false);
    expect(parsed.searchParams.has("utm_medium")).toBe(false);
    expect(parsed.searchParams.get("referral_id")).toBe("abc123");
  });
});
