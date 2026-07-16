import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** <MetricCard> — a single overview KPI tile (label + big value + optional foot). */
export function MetricCard({
  label,
  value,
  foot,
  className,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-component-id={testId}
      className={cn(
        "rounded-lg border border-admin-border bg-admin-surface px-4 py-3.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-admin-ink-2">
        {label}
      </div>
      <div className="mt-2 text-[26px] font-bold tabular-nums tracking-tight text-admin-ink">
        {value}
      </div>
      {foot ? (
        <div className="mt-1.5 text-[11px] text-admin-ink-3">{foot}</div>
      ) : null}
    </div>
  );
}
