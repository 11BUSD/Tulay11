"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Admin nav structure, mirroring the mockup sidebar groups. */
const NAV: NavGroup[] = [
  {
    group: "Revenue OS",
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/revenue", label: "Revenue analytics" },
    ],
  },
  {
    group: "Marketplace",
    items: [
      { href: "/admin/partners", label: "Partners" },
      { href: "/admin/applications", label: "Applications" },
      { href: "/admin/offers", label: "Offers" },
      { href: "/admin/ambassadors", label: "Ambassadors" },
      { href: "/admin/payouts", label: "Payouts" },
    ],
  },
  {
    group: "Agent & Outreach",
    items: [
      { href: "/admin/outreach/approvals", label: "Outreach approvals" },
      { href: "/admin/outreach/contacts", label: "Contacts" },
      { href: "/admin/outreach/campaigns", label: "Campaigns" },
      { href: "/admin/agents", label: "Agent runs" },
    ],
  },
  {
    group: "Governance",
    items: [
      { href: "/admin/due-diligence", label: "Due diligence" },
      { href: "/admin/agreements", label: "Agreements" },
      { href: "/admin/audit-logs", label: "Audit & consent" },
      { href: "/admin/consent-records", label: "Consent records" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav className="flex-1 overflow-y-auto px-2.5 py-1.5" aria-label="Admin">
      {NAV.map((section) => (
        <div key={section.group}>
          <div className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-widest text-[#7d766d]">
            {section.group}
          </div>
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium",
                  active
                    ? "bg-admin text-white"
                    : "text-[#d8d2ca] hover:bg-white/5 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
