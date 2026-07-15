/**
 * <Disclaimer> — renders the compliance disclaimer for a pillar/category.
 *
 * Server-component friendly (no client hooks). Regulated pillars render with a
 * scale icon and licensing copy; the non-regulated `general` case renders the
 * affiliate-disclosure copy with a link icon. Styling mirrors the approved
 * mockup (`pillar-banking-detail.html` `.disclaimer` block): a soft gold-tinted
 * notice with a left/top-aligned icon.
 */
import { getDisclaimer, type Pillar } from "@/lib/compliance/disclaimers";
import { cn } from "@/lib/utils";

export interface DisclaimerProps {
  pillar: Pillar;
  category?: string;
  className?: string;
}

export function Disclaimer({ pillar, category, className }: DisclaimerProps) {
  const config = getDisclaimer(pillar, category);
  const icon = config.requiresLicensedReferral ? "⚖️" : "🔗";

  return (
    <div
      role="note"
      data-pillar={config.pillar}
      data-regulated={config.requiresLicensedReferral ? "true" : "false"}
      className={cn(
        "mt-2 flex items-start gap-2 rounded-sm border border-gold/40 bg-gold-soft px-3 py-2 text-xs leading-relaxed text-ink-soft",
        className,
      )}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span>
        {config.requiresLicensedReferral && config.regulator ? (
          <>
            <b className="text-ink">Regulated by {config.regulator}.</b>{" "}
          </>
        ) : null}
        {config.body}
      </span>
    </div>
  );
}

export default Disclaimer;
