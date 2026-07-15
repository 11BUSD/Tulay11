/**
 * Real Supabase-session → admin-actor wiring.
 *
 * The default actor resolver in `roles.ts` returns `null` (fail-closed). This
 * module installs a real resolver that reads the authenticated Supabase user id
 * from the server session cookie and looks the actor's role up from `profiles`
 * (via `profileActorResolver`). It is installed with `ensureActorResolver`, so
 * it ONLY takes effect when no resolver has been injected — tests that call
 * `setActorResolver` always win, keeping existing suites unaffected.
 *
 * `installDefaultActorResolver()` is invoked from `instrumentation.ts` (the
 * Next.js server `register` hook, which runs before route handlers/layouts
 * resolve an actor) and is also called defensively from the admin layout so the
 * wiring is present even if instrumentation did not run for a given entry.
 */
import { ensureActorResolver, profileActorResolver } from "./roles";
import { getServiceDb } from "../db/client";

/**
 * Read the authenticated Supabase user id from the request session cookie.
 * Returns `null` when there is no valid session (→ fail-closed 401). Import of
 * `@/lib/supabase/server` is deferred so this module is safe to import in
 * non-request contexts (it pulls in `next/headers`).
 */
async function getSupabaseUserId(): Promise<string | null> {
  try {
    const { createClient } = await import("../supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    // No session / missing env / called outside a request scope → no actor.
    return null;
  }
}

let installed = false;

/**
 * Install the real Supabase-backed default actor resolver (idempotent). Safe to
 * call multiple times; only sets the default when no resolver was injected.
 */
export function installDefaultActorResolver(): void {
  // `getUserId` ignores the passed `Request`: the Supabase server client reads
  // the session from the Next.js request cookie store (`next/headers`), which
  // is the source of truth in Server Components and Route Handlers alike.
  ensureActorResolver(
    profileActorResolver(() => getSupabaseUserId(), getServiceDb()),
  );
  installed = true;
}

/** True once the default resolver has been installed (for diagnostics/tests). */
export function isDefaultActorResolverInstalled(): boolean {
  return installed;
}
