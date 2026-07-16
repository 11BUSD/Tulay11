import { describe, expect, it } from "vitest";
import { hashEmail, hashIp, isHashed, HASH_VERSION } from "./hashing";

describe("hashing", () => {
  it("is deterministic for the same input", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
    expect(hashEmail("Ana@Example.com")).toBe(hashEmail("ana@example.com"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashIp("203.0.113.5")).not.toBe(hashIp("203.0.113.6"));
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });

  it("is versioned with a v1: prefix", () => {
    expect(hashIp("203.0.113.5").startsWith(`${HASH_VERSION}:`)).toBe(true);
    expect(hashEmail("a@example.com").startsWith("v1:")).toBe(true);
  });

  it("never returns the raw value", () => {
    const ip = "203.0.113.5";
    const email = "secret@example.com";
    expect(hashIp(ip)).not.toContain(ip);
    expect(hashEmail(email)).not.toContain("secret");
    expect(hashEmail(email)).not.toContain("example.com");
  });

  it("is salted (HMAC hex, 64 chars after prefix)", () => {
    expect(isHashed(hashIp("203.0.113.5"))).toBe(true);
    expect(isHashed(hashEmail("a@example.com"))).toBe(true);
    expect(isHashed("203.0.113.5")).toBe(false);
    expect(isHashed("v1:short")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(() => hashIp("")).toThrow();
    expect(() => hashEmail("  ")).toThrow();
  });
});
