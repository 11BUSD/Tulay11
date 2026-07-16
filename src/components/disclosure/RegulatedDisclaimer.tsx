/**
 * <RegulatedDisclaimer> — the licensing disclaimer that MUST render on
 * regulated surfaces (insurance / tax / legal / immigration / financial) and on
 * concierge output for regulated topics.
 *
 * Mirrors the `.disclaimer` block in the `pillar-banking-detail` mockup: a
 * gold-tinted notice with a ⚖️ icon, the regulator name in bold, and a
 * "talk to a licensed pro" route. It is driven off the disclaimer DTO returned
 * by the recommendations / pillar / concierge routes (never hardcoded copy) so
 * the wording stays consistent with the compliance layer.
 */
import { cn } from "@/lib/utils";

export interface RegulatedDisclaimerDto {
  pillar: string;
  regulator: string | null;
  body: string;
  requires_licensed_referral: boolean;
}

export interface RegulatedDisclaimerProps {
  disclaimer: RegulatedDisclaimerDto;
  /** Optional "talk to a licensed pro" CTA. */
  routeHref?: string;
  routeLabel?: string;
  className?: string;
}

export function RegulatedDisclaimer({
  disclaimer,
  routeHref,
  routeLabel = "Talk to a licensed professional",
  className,
}: RegulatedDisclaimerProps) {
  return (
    <div
      role="note"
      data-component-id="regulated-disclaimer"
      data-pillar={disclaimer.pillar}
      data-regulated="true"
      className={cn(
        "mt-token-2 flex items-start gap-2 rounded-sm border border-gold/40 bg-gold-soft px-3 py-2 text-xs leading-relaxed text-ink-soft",
        className,
      )}
    >
      <span aria-hidden="true" className="shrink-0">
        ⚖️
      </span>
      <span>
        {disclaimer.regulator ? (
          <b className="text-ink">Regulated by {disclaimer.regulator}. </b>
        ) : null}
        {disclaimer.body}
        {routeHref ? (
          <>
            {" "}
            <a
              href={routeHref}
              className="font-semibold text-brand underline"
              data-component-id="route-to-pro"
            >
              {routeLabel} →
            </a>
          </>
        ) : null}
      </span>
    </div>
  );
}

export default RegulatedDisclaimer;
