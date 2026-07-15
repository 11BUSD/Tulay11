/**
 * DB-backed tests for data-subject requests. Export bundles subject rows +
 * consent history; delete anonymizes source PII while RETAINING append-only
 * audit/consent rows.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  createDataRequest,
  DataRequestNotVerifiedError,
  processDelete,
  processExport,
} from "@/lib/compliance/dataRequests";
import { recordConsent } from "@/lib/compliance/consent";
import { closeTestPool, getTestServiceDb, query } from "./db";

const hasDb = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);

afterAll(async () => {
  if (hasDb) await closeTestPool();
});

describe.skipIf(!hasDb)("dataRequests", () => {
  const db = () => getTestServiceDb();

  async function makeUser(email: string): Promise<string> {
    const [u] = await query<{ id: string }>(
      "insert into users (email, display_name, city) values ($1, 'Test User', 'Toronto') returning id",
      [email],
    );
    return u.id;
  }

  it("export requires email confirmation", async () => {
    const email = `export-unverified-${Date.now()}@example.com`;
    const userId = await makeUser(email);
    const req = await createDataRequest(
      { subjectId: userId, subjectEmail: email, kind: "export" },
      db(),
    );
    await expect(
      processExport(req.id, { emailConfirmed: false }, db()),
    ).rejects.toBeInstanceOf(DataRequestNotVerifiedError);
  });

  it("export bundles user row + consent history and completes", async () => {
    const email = `export-${Date.now()}@example.com`;
    const userId = await makeUser(email);
    await recordConsent(
      {
        subjectId: userId,
        subjectEmail: email,
        purpose: "account",
        consentTextVersion: "1.0.0",
      },
      db(),
    );
    const req = await createDataRequest(
      { subjectId: userId, subjectEmail: email, kind: "export" },
      db(),
    );
    const { request, bundle } = await processExport(
      req.id,
      { emailConfirmed: true },
      db(),
    );
    expect(request.status).toBe("completed");
    expect(request.completed_at).toBeTruthy();
    expect((bundle.user as { id: string }).id).toBe(userId);
    expect(bundle.consentHistory.length).toBeGreaterThanOrEqual(1);
  });

  it("delete requires email-confirm AND re-auth", async () => {
    const email = `delete-unverified-${Date.now()}@example.com`;
    const userId = await makeUser(email);
    const req = await createDataRequest(
      { subjectId: userId, subjectEmail: email, kind: "delete" },
      db(),
    );
    await expect(
      processDelete(req.id, { emailConfirmed: true, reauthenticated: false }, db()),
    ).rejects.toBeInstanceOf(DataRequestNotVerifiedError);
  });

  it("delete anonymizes source PII but retains audit + consent rows", async () => {
    const email = `delete-${Date.now()}@example.com`;
    const userId = await makeUser(email);
    const consent = await recordConsent(
      {
        subjectId: userId,
        subjectEmail: email,
        purpose: "account",
        consentTextVersion: "1.0.0",
      },
      db(),
    );

    const req = await createDataRequest(
      { subjectId: userId, subjectEmail: email, kind: "delete" },
      db(),
    );
    const done = await processDelete(
      req.id,
      { emailConfirmed: true, reauthenticated: true },
      db(),
    );
    expect(done.status).toBe("completed");

    // Source PII anonymized in place.
    const [user] = await query<{
      email: string;
      display_name: string | null;
      city: string | null;
    }>("select email, display_name, city from users where id = $1", [userId]);
    expect(user.email).toContain("deleted.invalid");
    expect(user.display_name).toBeNull();
    expect(user.city).toBeNull();

    // Original consent row retained (append-only), untouched.
    const consentRows = await query<{ id: string }>(
      "select id from consent_records where id = $1",
      [consent.id],
    );
    expect(consentRows.length).toBe(1);

    // Audit trail retained: a delete audit row exists for the user.
    const audit = await query<{ action: string }>(
      "select action from audit_logs where entity_type = 'users' and entity_id = $1",
      [userId],
    );
    expect(audit.map((a) => a.action)).toContain("data_request.deleted");
  });
});
