/**
 * GET /api/pillars/[slug] — PUBLIC single-pillar read.
 *
 * Returns the pillar row (from `settlement_pillars`) plus the same stubbed
 * `progress` shape as the list route, and the disclaimer config that governs
 * the pillar (so the pillar detail page knows whether it is a regulated surface
 * before it even loads offers). 404 when the slug is unknown.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { getDisclaimer, type Pillar } from "@/lib/compliance/disclaimers";
import { handleRouteError, jsonError } from "@/lib/api/http";
import type { PillarDto } from "../route";

export const runtime = "nodejs";

interface PillarRow {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  icon: string | null;
}

/**
 * Map a settlement-pillar slug to the disclaimer pillar that governs it.
 * Mirrors the mapping in the recommendations route so the pillar page and the
 * offer feed agree on which surfaces are regulated.
 */
const SETTLEMENT_TO_DISCLAIMER: Record<string, Pillar> = {
  tenant_insurance: "insurance",
  tax_benefits: "tax",
};

function disclaimerPillarFor(slug: string): Pillar {
  return SETTLEMENT_TO_DISCLAIMER[slug] ?? "general";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await ctx.params;
    const [row] = await getServiceDb().query<PillarRow>(
      `select slug, name, description, sort_order, icon
         from settlement_pillars
        where slug = $1 and active = true
        limit 1`,
      [slug],
    );
    if (!row) return jsonError(404, "Pillar not found");

    const disclaimer = getDisclaimer(disclaimerPillarFor(slug));

    const pillar: PillarDto = {
      slug: row.slug,
      name: row.name,
      description: row.description,
      sortOrder: row.sort_order,
      icon: row.icon,
      progress: { status: "not_started", percent: 0 },
    };

    return NextResponse.json({
      pillar,
      disclaimer: {
        pillar: disclaimer.pillar,
        regulator: disclaimer.regulator ?? null,
        body: disclaimer.body,
        requires_licensed_referral: disclaimer.requiresLicensedReferral,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
