/**
 * POST /api/data-requests — intake for PIPEDA export/delete requests.
 *
 * Zod-validated. Creates the request in `received` state via `createDataRequest`
 * (which writes an audit row). Execution (export bundle / delete) happens later,
 * gated on email-confirm + re-auth — this endpoint only intakes.
 */
import { NextResponse } from "next/server";
import { dataRequestInputSchema } from "@/lib/validation";
import { createDataRequest } from "@/lib/compliance/dataRequests";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = dataRequestInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const request = await createDataRequest({
    subjectId: input.subjectId ?? null,
    subjectEmail: input.subjectEmail ?? null,
    kind: input.kind,
  });

  return NextResponse.json(
    { id: request.id, kind: request.kind, status: request.status },
    { status: 201 },
  );
}
