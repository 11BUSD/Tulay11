/**
 * License verification — append-only compliance record for partner licensing.
 *
 * `license_verifications` is append-only (enforced by the 0009 trigger): every
 * check a human runs on a partner's license is a NEW row, never an update. When
 * the result is `verified` we also stamp `partners.license_verified_at` so the
 * recommendations layer can surface the partner for regulated pillars. Both
 * writes and the audit row happen in ONE transaction so the verification record
 * and the partner flag can never diverge.
 */
import { getServiceDb, type ServiceDb } from "../db/client";
import { recordAudit } from "../audit";

/** A row from `license_verifications`. */
export interface LicenseVerification {
  id: string;
  partner_id: string;
  license_type: string | null;
  license_number: string | null;
  verified_by: string | null;
  method: string | null;
  result: string | null;
  evidence_url: string | null;
  created_at: string;
}

/** Input to append a license verification. */
export interface RecordLicenseVerificationInput {
  partnerId: string;
  licenseType?: string | null;
  licenseNumber?: string | null;
  regulator?: string | null;
  method?: string | null;
  /** 'verified' stamps partners.license_verified_at; others clear it. */
  result: "verified" | "failed" | "expired";
  evidenceUrl?: string | null;
  /** Human actor who performed the check (recorded in the audit row). */
  actorId?: string | null;
}

/**
 * Append a `license_verifications` row and, when `result === 'verified'`, set
 * the partner's `license_verified_at` (and copy the license fields onto the
 * partner). A non-verified result clears `license_verified_at` so a failed or
 * expired check immediately hides the partner from regulated recommendations.
 * Writes an audit row in the same transaction.
 *
 * @param db optional existing `ServiceDb`/transaction handle so this joins the
 *           caller's transaction; defaults to the process-wide service DB.
 */
export async function recordLicenseVerification(
  input: RecordLicenseVerificationInput,
  db: ServiceDb = getServiceDb(),
): Promise<LicenseVerification> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<LicenseVerification>(
      `insert into license_verifications
         (partner_id, license_type, license_number, verified_by, method,
          result, evidence_url)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        input.partnerId,
        input.licenseType ?? null,
        input.licenseNumber ?? null,
        input.actorId ?? null,
        input.method ?? null,
        input.result,
        input.evidenceUrl ?? null,
      ],
    );

    const verified = input.result === "verified";
    const [partnerBefore] = await tx.query<{ license_verified_at: string | null }>(
      "select license_verified_at from partners where id = $1",
      [input.partnerId],
    );
    await tx.query(
      `update partners
         set license_verified_at = case when $2 then now() else null end,
             license_type = coalesce($3, license_type),
             license_number = coalesce($4, license_number),
             regulator = coalesce($5, regulator)
       where id = $1`,
      [
        input.partnerId,
        verified,
        input.licenseType ?? null,
        input.licenseNumber ?? null,
        input.regulator ?? null,
      ],
    );

    await recordAudit(
      {
        actorId: input.actorId ?? null,
        actorType: "human",
        action: "partner.license_verification_recorded",
        entityType: "license_verifications",
        entityId: row.id,
        before: partnerBefore
          ? { license_verified_at: partnerBefore.license_verified_at }
          : null,
        after: { result: input.result, verified, partner_id: input.partnerId },
      },
      tx,
    );

    return row;
  });
}
