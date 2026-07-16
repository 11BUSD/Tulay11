/**
 * <PartnerDisclosure> — the affiliate/referral-fee disclosure that MUST render
 * on every monetized offer card and CTA.
 *
 * Mirrors the `.disclose` block in the `pillar-banking-detail` mockup: a soft
 * info notice with an ℹ️ icon. The `earnsNothing` variant is used for editorial
 * picks that Tulay does not monetize (the mockup's Tangerine card) so the
 * disclosure stays honest either way.
 */
import { cn } from "@/lib/utils";

export interface PartnerDisclosureProps {
  /** When true, render the "we earn nothing" editorial variant. */
  earnsNothing?: boolean;
  className?: string;
}

export function PartnerDisclosure({
  earnsNothing = false,
  className,
}: PartnerDisclosureProps) {
  return (
    <div
      role="note"
      data-component-id="partner-disclosure"
      data-earns-nothing={earnsNothing ? "true" : "false"}
      className={cn(
        "mt-token-2 flex items-start gap-2 rounded-sm bg-surface-alt px-3 py-2 text-xs leading-relaxed text-ink-soft",
        className,
      )}
    >
      <span aria-hidden="true" className="shrink-0">
        ℹ️
      </span>
      <span>
        {earnsNothing ? (
          <>
            We include this option for balance even though{" "}
            <b className="text-ink">Tulay earns nothing</b> from it — because a
            good plan sometimes means the free choice.
          </>
        ) : (
          <>
            <b className="text-ink">
              Tulay may earn a referral fee if you use this offer
            </b>{" "}
            — this doesn&apos;t cost you anything and doesn&apos;t change the
            offer&apos;s terms. We show it because it fits your profile, not
            because of the fee.
          </>
        )}
      </span>
    </div>
  );
}

export default PartnerDisclosure;
