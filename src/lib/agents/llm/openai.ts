/**
 * OpenAI-backed LLM provider.
 *
 * Uses the `openai` npm package + `OPENAI_API_KEY`. Requests low temperature and
 * JSON-object output for extraction tasks. The client is constructed lazily on
 * first use so merely importing this module (or selecting the provider) never
 * requires a key — only an actual `complete()` call does. In test/CI this
 * provider is never selected (`getLLMProvider` returns the mock), so no network
 * call is made there.
 */
import OpenAI from "openai";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from "./provider";

/** Default model for extraction/drafting tasks. */
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI | undefined;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const client = this.getClient();
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: req.temperature ?? 0,
      max_tokens: req.maxTokens,
      messages: req.messages,
      ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
    });

    const text = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    if (req.json && text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    return {
      text,
      parsed,
      model: completion.model ?? DEFAULT_MODEL,
      simulated: false,
    };
  }

  async embed(text: string): Promise<number[]> {
    const client = this.getClient();
    const res = await client.embeddings.create({
      model: process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
      input: text,
    });
    return res.data[0]?.embedding ?? [];
  }
}
