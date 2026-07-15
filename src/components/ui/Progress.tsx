import { cn } from "@/lib/utils";

export interface ProgressProps {
  /** Completion value 0–100. */
  value: number;
  className?: string;
  label?: string;
}

export function Progress({ value, className, label }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-alt",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
