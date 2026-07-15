/**
 * /api/partners/[id] — read (GET), update (PATCH), delete (DELETE) a partner.
 *
 * GET is admin-only (internal data). PATCH/DELETE are admin-only mutations that
 * write an audit row. PATCH supports status changes (activate/pause) and, when
 * a `license_verification` block is present, appends a `license_verifications`
 * row via the compliance path (`recordLicenseVerification`), which stamps
 * `partners.license_verified_at` on a `verified` result — all in one
 * transaction with the field update and the audit row.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { partnerUpdateSchema } from "@/lib/validation";
import { recordLicenseVerification } from "@/lib/compliance/licenseVerification";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Columns a PATCH may update directly (license_verification handled apart). */
const UPDATABLE = [
  "name",
  "category",
  "website",
  "contact_email",
  "phone",
  "location",
  "languages_supported",
  "newcomer_focus",
  "filipino_focus",
  "ontario_focus",
  "licensed_required",
  "license_type",
  "license_number",
  "regulator",
  "status",
  "notes",
] as const;

export async function GET(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const rows = await getServiceDb().query(
      "select * from partners where id = $1",
      [id],
    );
    if (rows.length === 0) return jsonError(404, "Partner not found");
    return NextResponse.json({ partner: rows[0] });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;
    const body = await parseJson(req);
    const input = partnerUpdateSchema.parse(body);

    const updated = await getServiceDb().transaction(async (tx) => {
      const [before] = await tx.query<Record<string, unknown>>(
        "select * from partners where id = $1",
        [id],
      );
      if (!before) return null;

      // Apply direct field updates (excluding the license_verification block).
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const col of UPDATABLE) {
        if (col in input && input[col as keyof typeof input] !== undefined) {
          params.push(input[col as keyof typeof input]);
          sets.push(`${col} = $${params.length}`);
        }
      }
      let row = before;
      if (sets.length > 0) {
        params.push(id);
        const [next] = await tx.query<Record<string, unknown>>(
          `update partners set ${sets.join(", ")} where id = $${params.length} returning *`,
          params,
        );
        row = next;
      }

      // License verification flows through the compliance path (append-only
      // license_verifications + license_verified_at stamp), sharing this tx.
      if (input.license_verification) {
        const lv = input.license_verification;
        await recordLicenseVerification(
          {
            partnerId: id,
            licenseType: lv.license_type ?? input.license_type ?? null,
            licenseNumber: lv.license_number ?? input.license_number ?? null,
            regulator: lv.regulator ?? input.regulator ?? null,
            method: lv.method ?? null,
            result: lv.result,
            evidenceUrl: lv.evidence_url ?? null,
            actorId: actor.id,
          },
          tx,
        );
        // Re-read so the response reflects the license_verified_at stamp.
        const [next] = await tx.query<Record<string, unknown>>(
          "select * from partners where id = $1",
          [id],
        );
        row = next;
      }

      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "partner.updated",
          entityType: "partners",
          entityId: id,
          before,
          after: row,
        },
        tx,
      );
      return row;
    });

    if (!updated) return jsonError(404, "Partner not found");
    return NextResponse.json({ partner: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const { id } = await ctx.params;

    const deleted = await getServiceDb().transaction(async (tx) => {
      const [before] = await tx.query<Record<string, unknown>>(
        "select * from partners where id = $1",
        [id],
      );
      if (!before) return null;
      await tx.query("delete from partners where id = $1", [id]);
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "partner.deleted",
          entityType: "partners",
          entityId: id,
          before,
        },
        tx,
      );
      return before;
    });

    if (!deleted) return jsonError(404, "Partner not found");
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    return handleRouteError(err);
  }
}
