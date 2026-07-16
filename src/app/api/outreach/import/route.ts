/**
 * POST /api/outreach/import — CSV → `outreach_contacts`.
 *
 * Admin-only. Parses the uploaded CSV text and upserts contacts (dedupe by
 * email+campaign), returning created/skipped counts. Writes an audit row.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { outreachImportSchema } from "@/lib/validation";
import { handleRouteError, parseJson } from "@/lib/api/http";
import { importContacts } from "@/lib/outreach/csv-import";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = outreachImportSchema.parse(body);

    const db = getServiceDb();
    const result = await importContacts(input.csv, {
      campaignId: input.campaign_id ?? null,
      db,
    });

    await recordAudit(
      {
        actorId: actor.id,
        actorType: "human",
        action: "outreach.contacts_imported",
        entityType: "outreach_contacts",
        entityId: input.campaign_id ?? "import",
        after: { created: result.created, skipped: result.skipped },
      },
      db,
    );

    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
