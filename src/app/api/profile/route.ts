/**
 * GET/PATCH /api/profile — read/update the consumer profile.
 *
 * Reads/writes the `profiles` row (columns: id, role, display_name,
 * preferred_language, city). The consumer app uses this to persist onboarding
 * answers and let the user edit their profile.
 *
 *   - GET   /api/profile?id=... → the profile row (404 if unknown).
 *   - PATCH /api/profile        → partial update of the editable fields.
 *
 * `role` is never editable through this route (authorization data). Auth wiring
 * is cookie-based middleware; this route trusts the supplied id, which is the
 * pattern the rest of the app uses until full Supabase-Auth session wiring.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { profileUpdateSchema } from "@/lib/validation";
import { handleRouteError, jsonError, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

interface ProfileRow {
  id: string;
  role: string;
  display_name: string | null;
  preferred_language: string;
  city: string | null;
}

function toDto(r: ProfileRow) {
  return {
    id: r.id,
    role: r.role,
    displayName: r.display_name,
    preferredLanguage: r.preferred_language,
    city: r.city,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonError(400, "Query param 'id' is required");
    const [row] = await getServiceDb().query<ProfileRow>(
      `select id, role, display_name, preferred_language, city
         from profiles where id = $1 limit 1`,
      [id],
    );
    if (!row) return jsonError(404, "Profile not found");
    return NextResponse.json(toDto(row));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const body = await parseJson(req);
    const input = profileUpdateSchema.parse(body);
    if (!input.id) return jsonError(400, "Field 'id' is required");

    // Build the SET clause dynamically from only the provided fields.
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (input.displayName !== undefined) {
      sets.push(`display_name = $${i++}`);
      params.push(input.displayName);
    }
    if (input.preferredLanguage !== undefined) {
      sets.push(`preferred_language = $${i++}`);
      params.push(input.preferredLanguage);
    }
    if (input.city !== undefined) {
      sets.push(`city = $${i++}`);
      params.push(input.city);
    }
    params.push(input.id);

    const [row] = await getServiceDb().query<ProfileRow>(
      `update profiles set ${sets.join(", ")}
        where id = $${i}
        returning id, role, display_name, preferred_language, city`,
      params,
    );
    if (!row) return jsonError(404, "Profile not found");
    return NextResponse.json(toDto(row));
  } catch (err) {
    return handleRouteError(err);
  }
}
