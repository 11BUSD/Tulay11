import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";

/**
 * Admin operator shell — dark warm sidebar (nav) + a light neutral canvas main
 * column, matching the admin design mockups. This is a SEPARATE shell from the
 * consumer `AppShell` (different chrome + clay theme). Server component; the
 * active-link highlighting lives in the client `<AdminNav>`.
 */
export function AdminShell({
  children,
  actor,
}: {
  children: ReactNode;
  actor?: { name: string; role: string };
}) {
  const who = actor ?? { name: "Operator", role: "Admin" };
  const initials = who.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      data-component-id="admin-shell"
      className="grid min-h-screen grid-cols-[240px_1fr] bg-admin-canvas text-admin-ink"
    >
      <aside
        data-component-id="admin-sidebar"
        className="sticky top-0 flex h-screen flex-col bg-admin-sidebar text-[#d8d2ca]"
      >
        <div className="flex items-center gap-2.5 px-[18px] pb-3.5 pt-[18px]">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-gradient-to-br from-admin to-[#8a3b04] text-[15px] font-extrabold text-white">
            T
          </div>
          <div className="text-[16px] font-bold tracking-tight text-white">
            Tulay
          </div>
          <div className="ml-auto rounded bg-[rgba(180,83,10,0.28)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f3d9be]">
            Ops
          </div>
        </div>
        <AdminNav />
        <div className="flex items-center gap-2.5 border-t border-white/10 px-3.5 py-3">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#5a534a] text-[12px] font-bold text-white">
            {initials}
          </div>
          <div className="text-[12px] leading-tight">
            <b className="block font-semibold text-white">{who.name}</b>
            <span className="text-[11px] text-[#8f887e]">{who.role}</span>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <main className="px-[26px] pb-[60px] pt-6">{children}</main>
      </div>
    </div>
  );
}
