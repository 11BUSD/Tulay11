import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "neutral" | "brand" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  neutral: "bg-surface-alt text-ink-soft",
  brand: "bg-brand-soft text-brand-dark",
  success: "bg-brand-soft text-success",
  warning: "bg-gold-soft text-gold",
  danger: "bg-accent-soft text-danger",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
