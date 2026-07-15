/**
 * POST /api/leads — capture a lead submission with its embedded consent.
 *
 * There is no dedicated leads table (by design): a lead is an EXPRESS consent
 * to share PII with a named partner plus an audit record of the intent. This
 * route:
 *   1. validates the body (incl. the embedded consent) with zod,
 *   2. REJECTS with 422 when `consent.granted !== true` (no consent → no lead),
 *   3. writes the ConsentRecord via `recordConsent` (IP hashed, audited), and
 *   4. writes a `lead.submitted` audit row referencing the consent + partner.
 *
 * Returns `{consentId, status}`. Raw email is never stored (hashed downstream);
 * the audit row records the pillar/partner/offer, not the raw PII.
 */
import { NextResponse } from "next/server";
import { leadInputSchema } from "@/lib/validation";
import { recordConsent } from "@/lib/compliance/consent";
import { recordAudit } from "@/lib/audit";
import { getServiceDb } from "@/lib/db/client";
import { clientIp, handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await parseJson(req);
    const input = leadInputSchema.parse(body);

    // Consent gate: a lead cannot exist without an explicit express grant.
    if (input.consent.granted !== true) {
      return jsonError(422, "Consent is required to submit a lead", {
        code: "consent_required",
      });
    }

    const db = getServiceDb();

    // Persist the consent record (IP hashed, audit row written atomically).
    const consent = await recordConsent(
      {
        subjectEmail: input.email,
        purpose: input.consent.purpose,
        dataCategories: input.consent.dataCategories,
        sharedWith: input.consent.sharedWith,
        consequencesText: input.consent.consequencesText,
        consentTextVersion: input.consent.consentTextVersion,
        basis: input.consent.basis,
        granted: true,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      db,
    );

    // Record the lead intent as an audit row keyed to the consent record. No
    // raw PII is stored here — only the pillar/partner/offer references.
    await recordAudit(
      {
        actorType: "system",
        action: "lead.submitted",
        entityType: "consent_records",
        entityId: consent.id,
        after: {
          pillar: input.pillar,
          offer_id: input.offerId ?? null,
          partner_id: input.partnerId ?? null,
          shared_with: input.consent.sharedWith,
        },
      },
      db,
    );

    return NextResponse.json(
      { consentId: consent.id, status: "received" },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
