/**
 * /api/unsubscribe — opt-out endpoint.
 *
 * POST: JSON body `{ email, channel? }` (zod-validated).
 * GET:  one-click unsubscribe link — `?email=&channel=` (CASL requires a
 *       one-click opt-out in every outreach message).
 *
 * Both paths call `recordUnsubscribe`, which appends the unsubscribe row, a
 * consent withdrawal, and an audit row in one transaction. Only the hashed
 * email is stored.
 */
import { NextResponse } from "next/server";
import { unsubscribeInputSchema } from "@/lib/validation";
import { recordUnsubscribe } from "@/lib/compliance/casl";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = unsubscribeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await recordUnsubscribe({
    email: parsed.data.email,
    channel: parsed.data.channel,
  });
  return NextResponse.json({ unsubscribed: true }, { status: 201 });
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = unsubscribeInputSchema.safeParse({
    email: url.searchParams.get("email"),
    channel: url.searchParams.get("channel") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid ?email= is required" },
      { status: 400 },
    );
  }

  await recordUnsubscribe({
    email: parsed.data.email,
    channel: parsed.data.channel,
  });

  // One-click link is hit from an email client — return a simple confirmation.
  return new NextResponse(
    "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\">" +
      "<h1>You're unsubscribed</h1><p>You will no longer receive these messages from Tulay.</p>" +
      "</body></html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
