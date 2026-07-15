"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  RegulatedDisclaimer,
  type RegulatedDisclaimerDto,
} from "@/components/disclosure/RegulatedDisclaimer";
import { askConcierge } from "@/lib/api/concierge";
import { ApiError } from "@/lib/api/client";

interface ChatMessage {
  id: number;
  role: "user" | "bot";
  text: string;
  /** Set on a bot message that routed a regulated topic to a licensed pro. */
  routeToPro?: { pillar: string; disclaimer: RegulatedDisclaimerDto };
}

const GREETING: ChatMessage = {
  id: 0,
  role: "bot",
  text:
    "Kumusta! I'm your settlement concierge. I can explain steps, compare " +
    "options, and point you to the right service. What are you working on today?",
};

/**
 * <Chat> — the concierge chat UI.
 *
 * A persistent disclaimer banner sits above the thread. When the backend flags
 * a regulated topic (`regulated: true` + `routeToPro`), the bot bubble renders
 * a route-to-a-licensed-pro card (via <RegulatedDisclaimer>) INSTEAD of advice
 * — client-side reinforcement of the server-side guardrail.
 */
export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const userMsg: ChatMessage = {
      id: nextId.current++,
      role: "user",
      text: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setPending(true);
    try {
      const res = await askConcierge({ message: trimmed });
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "bot",
          text: res.reply,
          routeToPro: res.regulated ? res.routeToPro : undefined,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "bot",
          text:
            err instanceof ApiError
              ? "Sorry, I couldn't reach the concierge just now. Please try again."
              : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-component-id="concierge-chat"
      className="mx-auto flex max-w-2xl flex-col gap-token-2"
    >
      {/* Persistent disclaimer banner. */}
      <div
        data-component-id="concierge-disclaimer"
        role="note"
        className="flex items-start gap-2 rounded-sm border border-gold/40 bg-gold-soft px-3 py-2 text-xs leading-relaxed text-ink-soft"
      >
        <span aria-hidden="true">⚠️</span>
        <span>
          <b className="text-ink">
            Tulay Concierge gives general information only — not legal,
            immigration or financial advice.
          </b>{" "}
          For decisions about your case, we connect you with licensed
          professionals.
        </span>
      </div>

      <div
        data-component-id="chat-thread"
        className="flex flex-col gap-token-2"
        aria-live="polite"
      >
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div
              key={msg.id}
              data-role="user"
              className="max-w-[85%] self-end rounded-lg bg-brand px-3 py-2 text-sm text-white"
            >
              {msg.text}
            </div>
          ) : (
            <div key={msg.id} className="max-w-[85%] self-start">
              <div
                data-role="bot"
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                {msg.text}
              </div>
              {msg.routeToPro ? (
                <div data-component-id="chat-handoff">
                  <RegulatedDisclaimer
                    disclaimer={msg.routeToPro.disclaimer}
                    routeHref="/pillars"
                    routeLabel="Connect with a licensed professional"
                  />
                </div>
              ) : null}
            </div>
          ),
        )}
        {pending ? (
          <div
            data-component-id="chat-typing"
            className="max-w-[85%] self-start rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted"
          >
            Thinking…
          </div>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input
          data-component-id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any settlement step…"
          aria-label="Ask the concierge"
        />
        <Button type="submit" disabled={pending || input.trim() === ""}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default Chat;
