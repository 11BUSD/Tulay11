/**
 * Route guards: `requireRole` / `requireAdmin`.
 *
 * These resolve the current actor (via the injectable resolver in `roles.ts`)
 * and throw a structured `AuthError` when the actor is missing (401) or lacks
 * the required role (403). Route handlers catch `AuthError` and map its
 * `status` to an HTTP response; tests assert the thrown status directly.
 */
import { resolveActor, type Actor, type Role } from "./roles";

/** Structured auth failure carrying an HTTP status (401 or 403). */
export class AuthError extends Error {
  readonly status: 401 | 403;
  readonly code: "unauthorized" | "forbidden";

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = status === 401 ? "unauthorized" : "forbidden";
  }
}

/**
 * Require an authenticated actor with `role`. Throws `AuthError(401)` when no
 * actor is resolved and `AuthError(403)` when the actor has a different role.
 * Returns the actor on success.
 */
export async function requireRole(role: Role, req?: Request): Promise<Actor> {
  const actor = await resolveActor(req);
  if (!actor) {
    throw new AuthError(401, "Authentication required");
  }
  if (actor.role !== role) {
    throw new AuthError(403, `Requires role '${role}'`);
  }
  return actor;
}

/** Require an authenticated admin actor. Convenience over `requireRole`. */
export function requireAdmin(req?: Request): Promise<Actor> {
  return requireRole("admin", req);
}
