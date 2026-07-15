import Link from "next/link";
import { PillarProgress } from "./PillarProgress";
import type { Pillar } from "@/lib/api/pillars";

/** Emoji icons keyed by the seeded pillar `icon` token (falls back to a dot). */
const ICONS: Record<string, string> = {
  bank: "🏦",
  wifi: "📱",
  home: "🏠",
  shield: "🛡️",
  briefcase: "💼",
  heart: "🩺",
  receipt: "🧾",
  bus: "🚌",
  globe: "💸",
  users: "🤝",
};

export interface PillarGridProps {
  pillars: Pillar[];
}

/**
 * <PillarGrid> — the "Your 10 pillars" checklist from the dashboard mockup.
 * Each row links to the pillar detail page and shows a <PillarProgress> chip.
 */
export function PillarGrid({ pillars }: PillarGridProps) {
  if (pillars.length === 0) {
    return (
      <p
        data-component-id="pillar-grid-empty"
        className="rounded-lg border border-dashed border-line bg-surface p-token-3 text-sm text-ink-soft"
      >
        No settlement pillars are available yet. Please check back soon.
      </p>
    );
  }

  return (
    <ul data-component-id="pillar-grid" className="flex flex-col gap-2">
      {pillars.map((pillar) => (
        <li key={pillar.slug}>
          <Link
            href={`/pillars/${pillar.slug}`}
            data-component-id={`pillar-row-${pillar.slug}`}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-token-2 transition-colors hover:bg-surface-alt"
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-brand-soft text-lg"
            >
              {ICONS[pillar.icon ?? ""] ?? "•"}
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-ink">
                {pillar.name}
              </span>
              <span className="block text-xs text-ink-muted">
                {pillar.description}
              </span>
            </span>
            <PillarProgress
              status={pillar.progress.status}
              percent={pillar.progress.percent}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default PillarGrid;
