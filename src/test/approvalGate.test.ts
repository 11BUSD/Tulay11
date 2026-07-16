/**
 * DB-backed tests for the outreach approval gate. assertApprovedBeforeSend must
 * throw for pending/rejected/unsubscribed/throttled and pass only for a human
 * approval; each transition writes an audit row.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  approveOutreach,
  ApprovalError,
  assertApprovedBeforeSend,
  markSent,
  queueOutreach,
} from "@/lib/compliance/approvalGate";
import { recordUnsubscribe } from "@/lib/compliance/casl";
import { hashEmail } from "@/lib/compliance/hashing";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const HUMAN = "33333333-3333-3333-3333-333333333333";
const AGENT = "44444444-4444-4444-4444-444444444444";

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("approvalGate", () => {
  const db = () => getTestServiceDb();

  async function queueOne(recipientEmail = "counterparty@example.com") {
    const draftId = randomUUID();
    await queueOutreach(
      {
        draftId,
        channel: "email",
        recipientType: "counterparty",
        recipientRef: hashEmail(recipientEmail),
        bodyPreview: "Hello from Tulay",
        requestedBy: AGENT,
        reasoning: "Initial partner outreach based on research.",
      },
      db(),
    );
    return draftId;
  }

  it("throws for a pending (unapproved) draft", async () => {
    const draftId = await queueOne();
    await expect(
      assertApprovedBeforeSend(draftId, { db: db() }),
    ).rejects.toMatchObject({ code: "not_approved" });
  });

  it("throws for a rejected draft", async () => {
    const draftId = await queueOne();
    await approveOutreach(
      { draftId, approvedBy: HUMAN, decision: "rejected" },
      db(),
    );
    await expect(
      assertApprovedBeforeSend(draftId, { db: db() }),
    ).rejects.toMatchObject({ code: "not_approved" });
  });

  it("requires a human approver", async () => {
    const draftId = await queueOne();
    await expect(
      approveOutreach({ draftId, approvedBy: "" }, db()),
    ).rejects.toBeInstanceOf(ApprovalError);
  });

  it("passes for a human-approved draft", async () => {
    const draftId = await queueOne();
    await approveOutreach({ draftId, approvedBy: HUMAN }, db());
    const row = await assertApprovedBeforeSend(draftId, { db: db() });
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(HUMAN);
  });

  it("throws when the recipient is unsubscribed", async () => {
    const email = `unsub-${Date.now()}@example.com`;
    const draftId = await queueOne(email);
    await approveOutreach({ draftId, approvedBy: HUMAN }, db());
    await recordUnsubscribe({ email, channel: "all" }, db());
    await expect(
      assertApprovedBeforeSend(draftId, { db: db(), recipientEmail: email }),
    ).rejects.toMatchObject({ code: "unsubscribed" });
  });

  it("throttles a repeat send to the same recipient within the window", async () => {
    const email = `throttle-${Date.now()}@example.com`;
    const first = await queueOne(email);
    await approveOutreach({ draftId: first, approvedBy: HUMAN }, db());
    await assertApprovedBeforeSend(first, { db: db() });
    await markSent(first, HUMAN, db());

    // A second, separately-approved draft to the same recipient is throttled.
    const second = await queueOne(email);
    await approveOutreach({ draftId: second, approvedBy: HUMAN }, db());
    await expect(
      assertApprovedBeforeSend(second, { db: db(), throttleMs: 60_000 }),
    ).rejects.toMatchObject({ code: "throttled" });
  });

  it("audits each transition (queued, approved, sent)", async () => {
    const draftId = await queueOne();
    await approveOutreach({ draftId, approvedBy: HUMAN }, db());
    await assertApprovedBeforeSend(draftId, { db: db() });
    await markSent(draftId, HUMAN, db());

    const audits = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'outreach_approvals' and entity_id = $1 order by created_at asc",
      [draftId],
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("outreach.queued");
    expect(actions).toContain("outreach.approved");
    expect(actions).toContain("outreach.sent");
  });

  it("cannot self-approve without going through pending", async () => {
    const draftId = await queueOne();
    await approveOutreach({ draftId, approvedBy: HUMAN }, db());
    // Re-approving an already-approved draft is an invalid transition.
    await expect(
      approveOutreach({ draftId, approvedBy: HUMAN }, db()),
    ).rejects.toMatchObject({ code: "invalid_transition" });
  });
});
