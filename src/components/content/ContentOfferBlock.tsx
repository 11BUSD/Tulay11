import Link from "next/link";
import { PartnerDisclosure } from "@/components/disclosure/PartnerDisclosure";
import { RegulatedDisclaimer } from "@/components/disclosure/RegulatedDisclaimer";
import { getDisclaimer, type Pillar } from "@/lib/compliance/disclaimers";
import type { ContentOffer } from "@/content/types";

/**
 * Map a settlement-pillar slug to the disclaimer pillar that governs it (mirrors
 * the recommendations route). Unmapped slugs fall back to `general`.
 */
const SETTLEMENT_TO_DISCLAIMER: Record<string, Pillar> = {
  tenant_insurance: "insurance",
  tax_benefits: "tax",
};

function disclaimerPillarFor(slug: string): Pillar {
  return SETTLEMENT_TO_DISCLAIMER[slug] ?? "general";
}

/**
 * <ContentOfferBlock> — a monetized offer block for a content page. It ALWAYS
 * renders the partner-disclosure component (affiliate/referral-fee disclosure),
 * and for regulated pillars ALSO renders the licensing disclaimer with a
 * "talk to a licensed pro" route — so a content page can never surface an offer
 * without the required disclosure.
 */
export function ContentOfferBlock({ offer }: { offer: ContentOffer }) {
  const disclaimer = getDisclaimer(disclaimerPillarFor(offer.pillar));

  return (
    <aside
      data-component-id="content-offer"
      className="mt-token-4 rounded-lg border border-line bg-surface p-4"
    >
      <div className="text-xs font-bold uppercase tracking-widest text-gold">
        Trusted offer
      </div>
      <h3 className="mt-1 text-lg font-bold text-ink">{offer.title}</h3>
      <p className="mt-1 text-sm text-ink-soft">{offer.description}</p>
      <Link
        href={offer.href}
        className="mt-token-2 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
      >
        See offers
      </Link>

      {disclaimer.requiresLicensedReferral ? (
        <RegulatedDisclaimer
          disclaimer={{
            pillar: disclaimer.pillar,
            regulator: disclaimer.regulator ?? null,
            body: disclaimer.body,
            requires_licensed_referral: disclaimer.requiresLicensedReferral,
          }}
          routeHref="/concierge"
        />
      ) : null}

      {/* Affiliate/referral-fee disclosure — required on every offer block. */}
      <PartnerDisclosure />
    </aside>
  );
}

export default ContentOfferBlock;
