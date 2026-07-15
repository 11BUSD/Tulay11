/**
 * Lifecycle email — SimulatedEmailProvider tests (Task 23).
 *
 * Verifies the CASL gate: the simulated provider sends (records) a message ONLY
 * when the recipient has a live consent basis and is not unsubscribed, and
 * SKIPS the send after an unsubscribe. Every message carries a one-click
 * unsubscribe URL pointing at `GET /api/unsubscribe`. No network is ever used.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  SimulatedEmailProvider,
  buildUnsubscribeUrl,
} from "@/lib/email/provider";
import { recordConsent } from "@/lib/compliance/consent";
import { recordUnsubscribe } from "@/lib/compliance/casl";
import { closeTestPool, getTestServiceDb } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe("buildUnsubscribeUrl", () => {
  it("builds a one-click unsubscribe URL for the recipient + channel", () => {
    const url = buildUnsubscribeUrl("Person@Example.com", "https://app.tulay");
    expect(url).toContain("https://app.tulay/api/unsubscribe?");
    expect(url).toContain("channel=email");
    expect(url).toContain("email=Person%40Example.com");
  });
});

describe.skipIf(!hasDb)("SimulatedEmailProvider (CASL gate)", () => {
  const db = () => getTestServiceDb();

  it("sends with express consent, then skips after unsubscribe", async () => {
    const email = `lifecycle-${Date.now()}@example.com`;
    await recordConsent(
      {
        subjectEmail: email,
        purpose: "marketing",
        basis: "express",
        consentTextVersion: "1.0.0",
      },
      db(),
    );

    const provider = new SimulatedEmailProvider({
      baseUrl: "https://app.tulay",
      db: db(),
    });

    // Consent present + not unsubscribed → delivered.
    const first = await provider.send({
      to: email,
      subject: "Welcome to Tulay",
      body: "Here's how to get started.",
      purpose: "marketing",
    });
    expect(first.delivered).toBe(true);
    expect(first.unsubscribeUrl).toContain("/api/unsubscribe?");
    expect(provider.sent).toHaveLength(1);

    // Recipient unsubscribes → subsequent send is skipped by the CASL gate.
    await recordUnsubscribe({ email, channel: "all" }, db());
    const second = await provider.send({
      to: email,
      subject: "Second touch",
      body: "Another nudge.",
      purpose: "marketing",
    });
    expect(second.delivered).toBe(false);
    expect(second.skippedReason).toBe("unsubscribed_or_no_consent");
    expect(provider.sent).toHaveLength(1);
    expect(provider.skipped).toHaveLength(1);
  });

  it("skips when there is no consent basis at all", async () => {
    const email = `no-consent-${Date.now()}@example.com`;
    const provider = new SimulatedEmailProvider({ db: db() });
    const result = await provider.send({
      to: email,
      subject: "Cold email",
      body: "Should not send.",
      purpose: "marketing",
    });
    expect(result.delivered).toBe(false);
    expect(provider.sent).toHaveLength(0);
  });
});
