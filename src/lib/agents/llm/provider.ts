/**
 * LLM provider adapter interface + `getLLMProvider()` selector.
 *
 * Agents never talk to OpenAI directly — they go through `LLMProvider`. This
 * keeps the network dependency behind one seam so tests/CI use a deterministic
 * mock and never hit the network. `getLLMProvider()` returns the mock when
 * `NODE_ENV==='test'`, when `AGENTS_LLM_MOCK==='1'`, or when no `OPENAI_API_KEY`
 * is configured; otherwise the real OpenAI-backed provider.
 */

/** A single chat-style message. */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A completion request. `promptTag` keys deterministic mock fixtures and is a
 * cheap audit label for what kind of call this was.
 */
export interface LLMRequest {
  /** Stable tag identifying the prompt template (e.g. `partner-research`). */
  promptTag: string;
  messages: LLMMessage[];
  /** Request JSON-object output (structured extraction). */
  json?: boolean;
  /** Sampling temperature; low for extraction. Defaults to 0. */
  temperature?: number;
  maxTokens?: number;
}

/** A completion response. `parsed` is set when `json` was requested. */
export interface LLMResponse {
  text: string;
  parsed?: unknown;
  model: string;
  /** True when produced by the mock provider (no network). */
  simulated: boolean;
}

/** The seam agents depend on. */
export interface LLMProvider {
  complete(req: LLMRequest): Promise<LLMResponse>;
  /** Optional embedding support (unused by MVP agents). */
  embed?(text: string): Promise<number[]>;
}

import { MockLLMProvider } from "./mock";
import { OpenAIProvider } from "./openai";

/** True when the mock provider should be used (test/CI/no-key). */
export function shouldUseMockLLM(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.AGENTS_LLM_MOCK === "1" ||
    !process.env.OPENAI_API_KEY
  );
}

let overrideProvider: LLMProvider | undefined;

/** Inject a provider (tests can force the mock or a spy). */
export function setLLMProvider(provider: LLMProvider | undefined): void {
  overrideProvider = provider;
}

/**
 * Resolve the active LLM provider. Returns the mock in test/CI/no-key
 * environments so no network call is ever made there; OpenAI otherwise. The
 * OpenAI SDK client is only constructed on first `complete()`, so selecting the
 * provider never requires a key at import time.
 */
export function getLLMProvider(): LLMProvider {
  if (overrideProvider) return overrideProvider;
  if (shouldUseMockLLM()) return new MockLLMProvider();
  return new OpenAIProvider();
}
