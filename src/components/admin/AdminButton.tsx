import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "teal" | "danger" | "ok" | "ghost";

const variantClasses: Record<Variant, string> = {
  default:
    "border-admin-border-strong bg-admin-surface text-admin-ink hover:bg-admin-surface2",
  primary: "border-admin bg-admin text-white hover:bg-admin-600",
  teal: "border-admin-teal bg-admin-teal text-white",
  danger: "border-[#e6c9c9] bg-white text-admin-red hover:bg-admin-red-bg",
  ok: "border-[#c4e2cf] bg-white text-admin-green hover:bg-admin-green-bg",
  ghost: "border-transparent bg-transparent text-admin-ink-2 hover:bg-admin-surface2",
};

export interface AdminButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  sm?: boolean;
}

/** Dense admin button matching the mockup `.btn` styles. */
export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(
  function AdminButton(
    { className, variant = "default", sm, type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          sm ? "px-2.5 py-1.5 text-[11.5px]" : "px-3.5 py-2 text-[12.5px]",
          variantClasses[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
