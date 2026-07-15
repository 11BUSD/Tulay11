/**
 * /api/partners — list (GET) and create (POST) partners.
 *
 * Both are admin-only (partner data is internal). Create is zod-validated and
 * writes an `audit_logs` row in the same transaction as the insert. List
 * supports simple filters: `?status=`, `?category=`, `?filipino_focus=`.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { recordAudit } from "@/lib/audit";
import { partnerCreateSchema } from "@/lib/validation";
import { buildWhere, handleRouteError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const filipino = url.searchParams.get("filipino_focus");

    const { where, params } = buildWhere([
      ["status", url.searchParams.get("status")],
      ["category", url.searchParams.get("category")],
      ["filipino_focus", filipino != null ? filipino === "true" : null],
    ]);

    const rows = await getServiceDb().query(
      `select * from partners ${where} order by created_at desc`,
      params,
    );
    return NextResponse.json({ partners: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const actor = await requireAdmin(req);
    const body = await parseJson(req);
    const input = partnerCreateSchema.parse(body);

    const created = await getServiceDb().transaction(async (tx) => {
      const [row] = await tx.query<{ id: string }>(
        `insert into partners
           (name, category, website, contact_email, phone, location,
            languages_supported, newcomer_focus, filipino_focus, ontario_focus,
            licensed_required, license_type, license_number, regulator, status,
            notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         returning *`,
        [
          input.name,
          input.category ?? null,
          input.website ?? null,
          input.contact_email ?? null,
          input.phone ?? null,
          input.location ?? null,
          input.languages_supported,
          input.newcomer_focus,
          input.filipino_focus,
          input.ontario_focus,
          input.licensed_required,
          input.license_type ?? null,
          input.license_number ?? null,
          input.regulator ?? null,
          input.status,
          input.notes ?? null,
        ],
      );
      await recordAudit(
        {
          actorId: actor.id,
          actorType: "human",
          action: "partner.created",
          entityType: "partners",
          entityId: (row as { id: string }).id,
          after: row,
        },
        tx,
      );
      return row;
    });

    return NextResponse.json({ partner: created }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
