import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { installDefaultActorResolver } from "@/lib/auth/bootstrap";
import { resolveActor } from "@/lib/auth/roles";
import { AdminShell } from "@/components/layout/AdminShell";

export const runtime = "nodejs";
// The admin area is per-request (auth + live data): never statically cached.
export const dynamic = "force-dynamic";

/**
 * Admin layout — the SERVER-SIDE role guard (AC6). It ensures the real
 * Supabase-session→actor resolver is installed (idempotent; only sets the
 * default when no resolver was injected, so `setActorResolver` tests still win),
 * resolves the current actor, and redirects anyone who is not an `admin` to
 * `/login`. `/admin/**` is therefore unreachable without an admin role,
 * enforced here — not only in unit tests. Middleware does a lightweight cookie
 * presence check; this layout does the authoritative role check.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  installDefaultActorResolver();

  const actor = await resolveActor();
  if (!actor || actor.role !== "admin") {
    redirect("/login");
  }

  return (
    <AdminShell actor={{ name: "Operator", role: "Admin" }}>
      {children}
    </AdminShell>
  );
}
