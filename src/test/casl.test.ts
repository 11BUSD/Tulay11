/**
 * DB-backed tests for CASL controls: implied-consent expiry + unsubscribe honored.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  canContact,
  consentBasisFor,
  isUnsubscribed,
  recordUnsubscribe,
} from "@/lib/compliance/casl";
import { recordConsent } from "@/lib/compliance/consent";
import { closeTestPool, getTestServiceDb } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("casl", () => {
  const db = () => getTestServiceDb();

  it("express consent never expires", async () => {
    const email = `express-${Date.now()}@example.com`;
    await recordConsent(
      {
        subjectEmail: email,
        purpose: "marketing",
        basis: "express",
        consentTextVersion: "1.0.0",
      },
      db(),
    );
    const basis = await consentBasisFor({ subjectEmail: email }, "marketing", {
      db: db(),
      now: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // +10y
    });
    expect(basis).toBe("express");
  });

  it("implied consent expires after the window", async () => {
    const email = `implied-${Date.now()}@example.com`;
    await recordConsent(
      {
        subjectEmail: email,
        purpose: "marketing",
        basis: "implied",
        consentTextVersion: "1.0.0",
      },
      db(),
    );

    // Within window → implied.
    const fresh = await consentBasisFor(
      { subjectEmail: email },
      "marketing",
      { db: db(), maxAgeMs: 1000, now: new Date() },
    );
    expect(fresh).toBe("implied");

    // Past window → none.
    const expired = await consentBasisFor(
      { subjectEmail: email },
      "marketing",
      { db: db(), maxAgeMs: 1, now: new Date(Date.now() + 60_000) },
    );
    expect(expired).toBe("none");
  });

  it("canContact honors unsubscribe even with a valid grant", async () => {
    const email = `contactable-${Date.now()}@example.com`;
    await recordConsent(
      {
        subjectEmail: email,
        purpose: "marketing",
        basis: "express",
        consentTextVersion: "1.0.0",
      },
      db(),
    );
    expect(await canContact(email, "marketing", { db: db() })).toBe(true);

    await recordUnsubscribe({ email, channel: "all" }, db());

    expect(await isUnsubscribed(email, "email", db())).toBe(true);
    expect(await canContact(email, "marketing", { db: db() })).toBe(false);
  });
});
