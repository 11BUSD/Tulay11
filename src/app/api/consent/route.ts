/**
 * POST /api/consent — capture a consent grant (or withdrawal).
 *
 * Zod-validated. The write goes through `recordConsent`, which stores the IP
 * hashed and writes an `audit_logs` row in the same transaction.
 */
import { NextResponse } from "next/server";
import { consentInputSchema } from "@/lib/validation";
import { recordConsent } from "@/lib/compliance/consent";

export const runtime = "nodejs";

/** Best-effort client IP from proxy headers (hashed downstream, never stored raw). */
function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = consentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const record = await recordConsent({
    subjectId: input.subjectId ?? null,
    subjectEmail: input.subjectEmail ?? null,
    purpose: input.purpose,
    dataCategories: input.dataCategories,
    sharedWith: input.sharedWith ?? null,
    consequencesText: input.consequencesText ?? null,
    consentTextVersion: input.consentTextVersion,
    basis: input.basis,
    granted: input.granted,
    ip: clientIp(req),
    userAgent: input.userAgent ?? req.headers.get("user-agent"),
  });

  return NextResponse.json(
    { id: record.id, purpose: record.purpose, granted: record.granted },
    { status: 201 },
  );
}
