import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Status hue tokens mirroring the admin design system badge palette. */
export type AdminBadgeTone =
  | "green"
  | "amber"
  | "blue"
  | "red"
  | "slate"
  | "orange"
  | "violet";

const toneClasses: Record<AdminBadgeTone, string> = {
  green: "text-admin-green bg-admin-green-bg",
  amber: "text-admin-amber bg-admin-amber-bg",
  blue: "text-admin-blue bg-admin-blue-bg",
  red: "text-admin-red bg-admin-red-bg",
  slate: "text-admin-slate bg-admin-slate-bg",
  orange: "text-admin-600 bg-admin-050",
  violet: "text-admin-violet bg-admin-violet-bg",
};

export function AdminBadge({
  tone = "slate",
  children,
  className,
}: {
  tone?: AdminBadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-normal",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a partner status to a badge tone. */
export function partnerStatusTone(status: string): AdminBadgeTone {
  switch (status) {
    case "active":
      return "green";
    case "in_review":
    case "contacted":
      return "amber";
    case "paused":
      return "slate";
    case "rejected":
      return "red";
    default:
      return "blue";
  }
}

/** Map a payout status to a badge tone. */
export function payoutStatusTone(status: string): AdminBadgeTone {
  switch (status) {
    case "paid":
      return "green";
    case "approved":
      return "blue";
    case "rejected":
      return "red";
    default:
      return "amber";
  }
}
