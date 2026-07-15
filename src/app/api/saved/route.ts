/**
 * GET/POST/DELETE /api/saved — the consumer "saved" list.
 *
 * Backed by the `saved_resources` table (migration 0011). Rows are keyed by an
 * opaque `subjectRef` the client supplies (a profile id, anonymous id, or a
 * client token) so both signed-in and anonymous visitors can bookmark offers
 * without a full account. No PII beyond that ref is stored.
 *
 *   - GET    /api/saved?subjectRef=... → the subject's saved rows.
 *   - POST   /api/saved                → upsert a save (idempotent per offer).
 *   - DELETE /api/saved                → remove a saved row by id + subjectRef.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { savedCreateSchema, savedDeleteSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

interface SavedRow {
  id: string;
  subject_ref: string;
  offer_id: string | null;
  pillar: string | null;
  title: string;
  url: string | null;
  created_at: string;
}

function toDto(r: SavedRow) {
  return {
    id: r.id,
    offerId: r.offer_id,
    pillar: r.pillar,
    title: r.title,
    url: r.url,
    createdAt: r.created_at,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const subjectRef = url.searchParams.get("subjectRef");
    if (!subjectRef) {
      return jsonError(400, "Query param 'subjectRef' is required");
    }
    const rows = await getServiceDb().query<SavedRow>(
      `select * from saved_resources
        where subject_ref = $1
        order by created_at desc`,
      [subjectRef],
    );
    return NextResponse.json({ count: rows.length, saved: rows.map(toDto) });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await parseJson(req);
    const input = savedCreateSchema.parse(body);

    // Upsert: saving the same offer twice is a no-op (returns the existing row).
    const [row] = await getServiceDb().query<SavedRow>(
      `insert into saved_resources (subject_ref, offer_id, pillar, title, url)
       values ($1, $2, $3, $4, $5)
       on conflict (subject_ref, offer_id) where offer_id is not null
       do update set title = excluded.title, url = excluded.url,
                     pillar = excluded.pillar
       returning *`,
      [
        input.subjectRef,
        input.offerId ?? null,
        input.pillar ?? null,
        input.title,
        input.url ?? null,
      ],
    );
    return NextResponse.json(toDto(row), { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const body = await parseJson(req);
    const input = savedDeleteSchema.parse(body);
    const rows = await getServiceDb().query<{ id: string }>(
      `delete from saved_resources
        where id = $1 and subject_ref = $2
        returning id`,
      [input.id, input.subjectRef],
    );
    if (rows.length === 0) return jsonError(404, "Saved item not found");
    return NextResponse.json({ id: rows[0].id, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
