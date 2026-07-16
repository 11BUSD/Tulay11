"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PartnerDisclosure } from "@/components/disclosure/PartnerDisclosure";
import {
  RegulatedDisclaimer,
  type RegulatedDisclaimerDto,
} from "@/components/disclosure/RegulatedDisclaimer";
import { formatCents } from "@/lib/money";
import type { Recommendation } from "@/lib/api/offers";

export interface OfferCardProps {
  offer: Recommendation;
  /** Pillar disclaimer (shown when the offer is regulated). */
  disclaimer: RegulatedDisclaimerDto;
  /** Called when the user chooses this offer to request it. */
  onSelect?: (offer: Recommendation) => void;
  /** Called when the user saves this offer. */
  onSave?: (offer: Recommendation) => void;
  saved?: boolean;
  selected?: boolean;
}

/** Short monogram from the partner name for the logo tile. */
function monogram(name: string): string {
  return name
    .replace(/\[SAMPLE\]\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * <OfferCard> — a single recommended offer.
 *
 * Compliance invariants (see the pillar-banking mockup):
 *   - `<PartnerDisclosure>` renders on EVERY card (100% of monetized CTAs).
 *   - When the offer is regulated, a `<RegulatedDisclaimer>` renders too,
 *     driven by the disclaimer DTO from the recommendations response.
 */
export function OfferCard({
  offer,
  disclaimer,
  onSelect,
  onSave,
  saved = false,
  selected = false,
}: OfferCardProps) {
  // `user_reward_value_cents` is a bigint column, which node-postgres returns
  // as a string over JSON — coerce to an integer before formatting so
  // `formatCents` (which requires an integer) never throws.
  const rewardCents = Math.trunc(Number(offer.user_reward_value_cents));
  const reward =
    Number.isFinite(rewardCents) && rewardCents > 0
      ? formatCents(rewardCents)
      : null;

  return (
    <article
      data-component-id="offer-card"
      data-offer-id={offer.id}
      data-regulated={offer.regulated ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      className="rounded-lg border border-line bg-surface p-token-3 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-brand-soft text-sm font-bold text-brand-dark"
        >
          {monogram(offer.partner.name)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{offer.title}</h3>
            {offer.regulated ? (
              <Badge variant="warning">Regulated</Badge>
            ) : null}
            {offer.license_verified ? (
              <Badge variant="success">License verified</Badge>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">
            {offer.partner.name} · Partner offer
          </p>
          {reward ? (
            <p className="mt-1 text-sm text-ink-soft">
              Bonus <b className="text-ink">{reward}</b> reward
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-token-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          data-component-id="offer-select"
          onClick={() => onSelect?.(offer)}
        >
          Request this offer
        </Button>
        {offer.partner.website ? (
          <a
            href={offer.partner.website}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="text-sm font-medium text-brand underline"
          >
            Details
          </a>
        ) : null}
        {onSave ? (
          <Button
            size="sm"
            variant="ghost"
            data-component-id="offer-save"
            aria-pressed={saved}
            onClick={() => onSave(offer)}
          >
            {saved ? "Saved ✓" : "Save"}
          </Button>
        ) : null}
      </div>

      {/* Partner disclosure — required on every monetized offer. */}
      <PartnerDisclosure />

      {/* Regulated disclaimer — only when the offer is a regulated surface. */}
      {offer.regulated ? (
        <RegulatedDisclaimer disclaimer={disclaimer} routeHref="/concierge" />
      ) : null}
    </article>
  );
}

export default OfferCard;
