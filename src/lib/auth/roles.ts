/**
 * Roles + the injectable current-actor resolver.
 *
 * Authorization derives from `profiles.role` (see 0002_core_identity.sql). In
 * production the current actor comes from the Supabase session; but to keep
 * admin-guard and consent logic unit-testable WITHOUT a real Supabase auth
 * context, the "who is calling" lookup goes through a replaceable resolver.
 * Tests call `setActorResolver()` to inject an admin / non-admin actor; app
 * code leaves the default resolver in place.
 */
import { getServiceDb, type ServiceDb } from "../db/client";

/** Roles stored in `profiles.role`. */
export type Role = "user" | "ambassador" | "admin";

/** The resolved current actor for a request. */
export interface Actor {
  id: string;
  role: Role;
  actorType: "human" | "agent" | "system";
}

/**
 * Resolves the current actor for an incoming request. `req` is optional so the
 * resolver works both in route handlers (with a `Request`) and in server-side
 * calls without one. Returns `null` when there is no authenticated actor.
 */
export type ActorResolver = (req?: Request) => Promise<Actor | null>;

/**
 * Default resolver used by the app. The real Supabase-Auth wiring is added by
 * the auth workstream; until then this returns `null` (no session), which makes
 * `requireAdmin`/`requireRole` throw 401 — fail-closed. Tests and internal
 * server contexts override it via `setActorResolver`.
 */
const defaultResolver: ActorResolver = async () => null;

let resolver: ActorResolver = defaultResolver;

/** Inject a custom actor resolver (used by tests + server contexts). */
export function setActorResolver(next: ActorResolver): void {
  resolver = next;
}

/** Restore the default (no-session) resolver. */
export function resetActorResolver(): void {
  resolver = defaultResolver;
}

/** Resolve the current actor via the active resolver. */
export function resolveActor(req?: Request): Promise<Actor | null> {
  return resolver(req);
}

/**
 * Build an actor resolver that reads the actor from `profiles` by id. Handy for
 * server contexts that already know the authenticated user id (e.g. from a
 * verified session) and just need the role.
 */
export function profileActorResolver(
  getUserId: (req?: Request) => Promise<string | null>,
  db: ServiceDb = getServiceDb(),
): ActorResolver {
  return async (req?: Request) => {
    const userId = await getUserId(req);
    if (!userId) return null;
    const rows = await db.query<{ role: Role }>(
      "select role from profiles where id = $1",
      [userId],
    );
    if (rows.length === 0) return null;
    return { id: userId, role: rows[0].role, actorType: "human" };
  };
}
