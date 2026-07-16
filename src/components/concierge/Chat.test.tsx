import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Chat } from "./Chat";
import type { ConciergeResponse } from "@/lib/api/concierge";

const askConcierge = vi.fn();

vi.mock("@/lib/api/concierge", () => ({
  askConcierge: (body: unknown) => askConcierge(body),
}));

describe("<Chat> regulated-advice boundary (AC4)", () => {
  beforeEach(() => {
    askConcierge.mockReset();
  });

  it("always shows the persistent disclaimer banner", () => {
    const { container } = render(<Chat />);
    expect(
      container.querySelector('[data-component-id="concierge-disclaimer"]'),
    ).not.toBeNull();
  });

  it("renders the route-to-pro handoff (not advice) for a regulated reply", async () => {
    const response: ConciergeResponse = {
      reply:
        "I can share general information, but I can't give advice on your " +
        "specific situation here.",
      regulated: true,
      routeToPro: {
        pillar: "tax",
        disclaimer: {
          pillar: "tax",
          regulator: "CRA",
          body: "Informational only — not tax advice.",
          requires_licensed_referral: true,
        },
      },
    };
    askConcierge.mockResolvedValue(response);

    const { container } = render(<Chat />);
    fireEvent.change(screen.getByLabelText("Ask the concierge"), {
      target: { value: "Do I owe tax on my remittance?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(
        container.querySelector('[data-component-id="chat-handoff"]'),
      ).not.toBeNull(),
    );
    const handoff = container.querySelector(
      '[data-component-id="chat-handoff"]',
    );
    expect(handoff?.textContent).toContain("CRA");
    // The route-to-pro CTA is present.
    expect(
      container.querySelector('[data-component-id="route-to-pro"]'),
    ).not.toBeNull();
  });

  it("does not render a handoff for a non-regulated reply", async () => {
    askConcierge.mockResolvedValue({
      reply: "Here's how the bus system generally works…",
      regulated: false,
    } satisfies ConciergeResponse);

    const { container } = render(<Chat />);
    fireEvent.change(screen.getByLabelText("Ask the concierge"), {
      target: { value: "How do buses work?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(screen.getByText(/bus system/i)).toBeInTheDocument(),
    );
    expect(
      container.querySelector('[data-component-id="chat-handoff"]'),
    ).toBeNull();
  });
});
