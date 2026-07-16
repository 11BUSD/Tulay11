/**
 * GET /api/recommendations?pillar=&city=&lang= — PUBLIC ranked offer feed.
 *
 * This is the one public read in the Partner/Affiliate OS: no admin guard. It
 * loads ACTIVE, live offers for the requested settlement pillar joined to their
 * partner, runs `rankOffers` (Filipino/Tagalog + city/language boosts, fallback
 * to general offers when no city matches), and returns each offer annotated
 * with partner disclosure + the pillar disclaimer.
 *
 * Regulated pillars (per `getDisclaimer(...).requiresLicensedReferral`, or a
 * partner flagged `licensed_required`) only surface offers whose partner has a
 * verified license (`partners.license_verified_at` set) — an unverified
 * regulated partner is filtered out entirely.
 */
import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/db/client";
import { rankOffers, type RankableOffer } from "@/lib/ranking";
import { getDisclaimer, type Pillar } from "@/lib/compliance/disclaimers";
import { handleRouteError, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Map a settlement-pillar slug to the disclaimer pillar that governs it.
 * Unmapped slugs fall back to `general` (affiliate-disclosure, not regulated).
 */
const SETTLEMENT_TO_DISCLAIMER: Record<string, Pillar> = {
  tenant_insurance: "insurance",
  tax_benefits: "tax",
  // Remaining settlement pillars (banking, housing, jobs, ...) are not directly
  // regulated advice surfaces → general affiliate disclosure.
};

/** Resolve the disclaimer pillar for a settlement-pillar slug. */
function disclaimerPillarFor(slug: string): Pillar {
  return SETTLEMENT_TO_DISCLAIMER[slug] ?? "general";
}

interface OfferRow extends RankableOffer {
  id: string;
  partner_id: string;
  title: string;
  settlement_pillar: string | null;
  destination_url: string | null;
  tracking_code: string | null;
  partner_name: string;
  partner_category: string | null;
  partner_licensed_required: boolean;
  partner_license_verified_at: string | null;
  partner_website: string | null;
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const pillar = url.searchParams.get("pillar");
    const city = url.searchParams.get("city");
    const lang = url.searchParams.get("lang");
    if (!pillar) return jsonError(400, "Query param 'pillar' is required");

    const disclaimer = getDisclaimer(disclaimerPillarFor(pillar));

    // Load active + live offers for the pillar joined to their partner. Only
    // active partners' offers are surfaced.
    const rows = await getServiceDb().query<OfferRow>(
      `select
         o.*,
         p.name              as partner_name,
         p.category          as partner_category,
         p.filipino_focus    as partner_filipino_focus,
         p.licensed_required as partner_licensed_required,
         p.license_verified_at as partner_license_verified_at,
         p.website           as partner_website
       from partner_offers o
       join partners p on p.id = o.partner_id
       where o.settlement_pillar = $1
         and o.active = true
         and o.status = 'live'
         and p.status = 'active'`,
      [pillar],
    );

    // Regulated gate: when the pillar requires a licensed referral, or an
    // individual partner is flagged licensed_required, only offers with a
    // verified license survive.
    const gated = rows.filter((r) => {
      const regulated = disclaimer.requiresLicensedReferral || r.partner_licensed_required;
      if (!regulated) return true;
      return r.partner_license_verified_at != null;
    });

    const ranked = rankOffers(gated, { city, language: lang });

    const recommendations = ranked.map((o) => {
      const regulated =
        disclaimer.requiresLicensedReferral || o.partner_licensed_required;
      return {
        id: o.id,
        partner_id: o.partner_id,
        title: o.title,
        settlement_pillar: o.settlement_pillar,
        destination_url: o.destination_url,
        tracking_code: o.tracking_code,
        offer_type: o.offer_type,
        priority_score: o.priority_score,
        commission_type: o.commission_type,
        user_reward_value_cents: o.user_reward_value_cents,
        city_targets: o.city_targets,
        language_targets: o.language_targets,
        // Partner disclosure — always surfaced so the user sees who they'd deal with.
        partner: {
          id: o.partner_id,
          name: o.partner_name,
          category: o.partner_category,
          website: o.partner_website,
          license_verified: o.partner_license_verified_at != null,
        },
        // Compliance flags for the UI.
        regulated,
        requires_licensed_referral: disclaimer.requiresLicensedReferral,
        license_verified: o.partner_license_verified_at != null,
      };
    });

    return NextResponse.json({
      pillar,
      disclaimer: {
        pillar: disclaimer.pillar,
        regulator: disclaimer.regulator ?? null,
        body: disclaimer.body,
        requires_licensed_referral: disclaimer.requiresLicensedReferral,
      },
      count: recommendations.length,
      recommendations,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
