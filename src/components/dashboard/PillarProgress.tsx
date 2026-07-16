import { cn } from "@/lib/utils";
import type { PillarProgressStatus } from "@/lib/api/pillars";

export interface PillarProgressProps {
  status: PillarProgressStatus;
  percent: number;
  className?: string;
}

const LABELS: Record<PillarProgressStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * <PillarProgress> — the small per-pillar status indicator used on the
 * dashboard rows (the `.mr` chip in the dashboard mockup). Shows a ✓ when done,
 * otherwise the completion percent, plus an accessible status label.
 */
export function PillarProgress({
  status,
  percent,
  className,
}: PillarProgressProps) {
  const isDone = status === "done";
  return (
    <span
      data-component-id="pillar-progress"
      data-status={status}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        isDone
          ? "bg-brand text-white"
          : status === "in_progress"
            ? "bg-brand-soft text-brand-dark"
            : "bg-surface-alt text-ink-muted",
        className,
      )}
      title={LABELS[status]}
    >
      {isDone ? (
        <>
          <span aria-hidden="true">✓</span>
          <span className="sr-only">{LABELS[status]}</span>
        </>
      ) : (
        <>
          <span aria-hidden="true">{percent}%</span>
          <span className="sr-only">
            {LABELS[status]}, {percent}% complete
          </span>
        </>
      )}
    </span>
  );
}

export default PillarProgress;
