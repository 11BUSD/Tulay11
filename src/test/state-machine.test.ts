/**
 * Outreach state machine: legal transitions apply + audit; illegal transitions
 * throw; the transition table matches the spec.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canTransition,
  transitionMessage,
  InvalidTransitionError,
  TRANSITIONS,
  type OutreachState,
} from "@/lib/outreach/state-machine";
import { clearServiceDb, setServiceDb } from "@/lib/db/client";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

beforeAll(() => {
  if (hasDb) setServiceDb(getTestServiceDb());
});

afterAll(async () => {
  if (hasDb) {
    clearServiceDb();
    await closeTestPool();
  }
});

describe("transition table (pure)", () => {
  it("allows the documented legal transitions", () => {
    expect(canTransition("not_started", "drafted")).toBe(true);
    expect(canTransition("drafted", "approved")).toBe(true);
    expect(canTransition("drafted", "rejected")).toBe(true);
    expect(canTransition("approved", "sent")).toBe(true);
    expect(canTransition("sent", "replied")).toBe(true);
    expect(canTransition("sent", "follow_up_due")).toBe(true);
    expect(canTransition("follow_up_due", "drafted")).toBe(true);
    expect(canTransition("replied", "meeting_booked")).toBe(true);
    expect(canTransition("meeting_booked", "agreement_pending")).toBe(true);
    expect(canTransition("agreement_pending", "active_partner")).toBe(true);
  });

  it("rejects illegal transitions + terminal states", () => {
    expect(canTransition("not_started", "sent")).toBe(false);
    expect(canTransition("drafted", "sent")).toBe(false);
    expect(canTransition("approved", "replied")).toBe(false);
    expect(TRANSITIONS.rejected).toEqual([]);
    expect(TRANSITIONS.active_partner).toEqual([]);
  });
});

describe.skipIf(!hasDb)("transitionMessage (DB-backed, audited)", () => {
  async function makeMessage(state: OutreachState): Promise<string> {
    const db = getTestServiceDb();
    const [c] = await db.query<{ id: string }>(
      `insert into outreach_campaigns (name) values ('[TEST] SM Campaign') returning id`,
    );
    const [ct] = await db.query<{ id: string }>(
      `insert into outreach_contacts (name, email, consent_status) values ('[TEST]','sm-${Date.now()}-${Math.random()}@example.com','opted_in') returning id`,
    );
    const [m] = await db.query<{ id: string }>(
      `insert into outreach_messages (campaign_id, contact_id, direction, state) values ($1,$2,'outbound',$3) returning id`,
      [c.id, ct.id, state],
    );
    return m.id;
  }

  it("applies a legal transition + writes audit", async () => {
    const id = await makeMessage("drafted");
    const updated = await transitionMessage(id, "approved", {
      actorId: "44444444-4444-4444-4444-444444444401",
      actorType: "human",
      columns: { approved_at: new Date().toISOString() },
    });
    expect(updated.state).toBe("approved");

    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type='outreach_messages' and entity_id=$1",
      [id],
    );
    expect(audits.map((a) => a.action)).toContain("outreach.state.approved");
  });

  it("throws on an illegal transition", async () => {
    const id = await makeMessage("drafted");
    await expect(transitionMessage(id, "sent")).rejects.toThrow(
      InvalidTransitionError,
    );
  });
});
