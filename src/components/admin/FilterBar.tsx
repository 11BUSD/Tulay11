"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A pill-style filter toggle used across admin list screens. */
export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold",
        active
          ? "border-admin-ink bg-admin-ink text-white"
          : "border-admin-border-strong bg-admin-surface text-admin-ink-2 hover:bg-admin-surface2",
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2">{children}</div>
  );
}
