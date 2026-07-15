/**
 * GET /api/pillars — PUBLIC list of the settlement pillars.
 *
 * Reads `settlement_pillars` (the single source of truth for the 10 pillar
 * slugs/labels/icons) ordered by `sort_order`. No user-progress table exists
 * yet, so each pillar carries a stubbed `progress` shape (status defaulting to
 * `not_started`, percent 0) the dashboard can render today and we can back with
 * real progress later without changing the response shape.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { handleRouteError } from "@/lib/api/http";

export const runtime = "nodejs";

interface PillarRow {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  icon: string | null;
}

/** Public pillar shape returned to the consumer app. */
export interface PillarDto {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  icon: string | null;
  progress: {
    status: "not_started" | "in_progress" | "done";
    percent: number;
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await getServiceDb().query<PillarRow>(
      `select slug, name, description, sort_order, icon
         from settlement_pillars
        where active = true
        order by sort_order asc`,
    );

    const pillars: PillarDto[] = rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      sortOrder: r.sort_order,
      icon: r.icon,
      // Progress is a stub until a user-progress table exists.
      progress: { status: "not_started", percent: 0 },
    }));

    return NextResponse.json({ count: pillars.length, pillars });
  } catch (err) {
    return handleRouteError(err);
  }
}
