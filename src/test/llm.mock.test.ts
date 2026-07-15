/**
 * MockLLMProvider tests — deterministic, no network.
 *
 * Asserts `getLLMProvider()` selects the mock in the test env, fixtures resolve
 * by prompt tag, and no network module is touched (the mock never imports
 * `openai`). We monkeypatch global `fetch` to fail loudly if any call is made.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockLLMProvider } from "@/lib/agents/llm/mock";
import { getLLMProvider, shouldUseMockLLM } from "@/lib/agents/llm/provider";

describe("MockLLMProvider / getLLMProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("selects the mock in NODE_ENV=test", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(shouldUseMockLLM()).toBe(true);
    expect(getLLMProvider()).toBeInstanceOf(MockLLMProvider);
  });

  it("returns deterministic fixtures keyed by prompt tag (no network)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled in test"));

    const llm = new MockLLMProvider();
    const res = await llm.complete({
      promptTag: "partner-research",
      json: true,
      messages: [{ role: "user", content: "x" }],
    });
    expect(res.simulated).toBe(true);
    expect(res.model).toBe("mock");
    expect((res.parsed as { fitScore: number }).fitScore).toBeTypeOf("number");

    // Same tag → identical output (deterministic).
    const res2 = await llm.complete({
      promptTag: "partner-research",
      json: true,
      messages: [{ role: "user", content: "different" }],
    });
    expect(res2.text).toBe(res.text);

    // Unknown tag → deterministic echo fallback, still no network.
    const echo = await llm.complete({
      promptTag: "unknown-tag",
      json: true,
      messages: [{ role: "user", content: "hello" }],
    });
    expect((echo.parsed as { echo: string }).echo).toBe("hello");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
