/**
 * POST /api/outreach/messages/[id]/send — simulated dispatch.
 *
 * Admin-only. REJECTS any message whose state is not `approved` (the approval
 * gate). On success it dispatches via `SimulatedSendProvider` (NO network),
 * transitions `approved → sent` (guarded), stamps `sent_at`,
 * `provider_message_id`, `simulated=true`, and audits the send. No real
 * outbound message is ever produced.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError, HttpError } from "@/lib/api/http";
import { uuidSchema } from "@/lib/validation";
import { transitionMessage } from "@/lib/outreach/state-machine";
import { getSendProvider } from "@/lib/outreach/send-adapter";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    uuidSchema.parse(id);

    const db = getServiceDb();
    const [message] = await db.query<{
      id: string;
      state: string;
      subject: string | null;
      body: string | null;
      contact_id: string | null;
    }>(
      "select id, state, subject, body, contact_id from outreach_messages where id = $1",
      [id],
    );
    if (!message) throw new HttpError(404, "Message not found");

    // Approval gate: only an approved message may be sent.
    if (message.state !== "approved") {
      throw new HttpError(
        422,
        `Cannot send: message is '${message.state}', not 'approved'`,
        { code: "not_approved" },
      );
    }

    // Resolve recipient email for the (logged, no-network) dispatch.
    let toEmail: string | null = null;
    if (message.contact_id) {
      const [c] = await db.query<{ email: string | null }>(
        "select email from outreach_contacts where id = $1",
        [message.contact_id],
      );
      toEmail = c?.email ?? null;
    }

    // Simulated dispatch — never touches the network.
    const provider = getSendProvider();
    const dispatch = await provider.send({
      id: message.id,
      toEmail,
      subject: message.subject,
      body: message.body ?? "",
    });

    const updated = await transitionMessage(id, "sent", {
      actorId: actor.id,
      actorType: "human",
      columns: {
        sent_at: new Date().toISOString(),
        provider_message_id: dispatch.providerMessageId,
        simulated: dispatch.simulated,
      },
      db,
    });

    return NextResponse.json({
      message: updated,
      dispatch: { simulated: dispatch.simulated, providerMessageId: dispatch.providerMessageId },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
