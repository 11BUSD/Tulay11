/**
 * Shared harness for API route-handler integration tests.
 *
 * Route handlers call `getServiceDb()` (the process-wide DB) and `resolveActor`
 * (the injectable auth resolver) internally, so tests point both at the test
 * Postgres / a chosen actor before invoking the exported GET/POST/PATCH/DELETE
 * functions with constructed `Request` objects.
 *
 *   - `useTestDb()` injects a `ServiceDb` bound to TEST_DATABASE_URL.
 *   - `asAdmin()` / `asUser()` / `asAnon()` set the actor resolver.
 *   - `jsonRequest` / `getRequest` build `Request`s the handlers accept.
 */
import { clearServiceDb, setServiceDb } from "@/lib/db/client";
import { resetActorResolver, setActorResolver, type Actor } from "@/lib/auth/roles";
import { getTestServiceDb } from "./db";

export const SEED_ADMIN_ID = "44444444-4444-4444-4444-444444444401";
export const SEED_USER_ID = "44444444-4444-4444-4444-444444444402";

/** Point route handlers' `getServiceDb()` at the test database. */
export function useTestDb(): void {
  setServiceDb(getTestServiceDb());
}

/** Restore the default DB + actor resolver (call in afterEach/afterAll). */
export function resetHarness(): void {
  clearServiceDb();
  resetActorResolver();
}

/** Inject an admin actor (defaults to the seeded admin id). */
export function asAdmin(id: string = SEED_ADMIN_ID): Actor {
  const actor: Actor = { id, role: "admin", actorType: "human" };
  setActorResolver(async () => actor);
  return actor;
}

/** Inject a non-admin user actor. */
export function asUser(id: string = SEED_USER_ID): Actor {
  const actor: Actor = { id, role: "user", actorType: "human" };
  setActorResolver(async () => actor);
  return actor;
}

/** Inject no actor (unauthenticated). */
export function asAnon(): void {
  setActorResolver(async () => null);
}

/** Build a JSON-body Request for POST/PATCH handlers. */
export function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Build a GET Request. */
export function getRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { method: "GET", headers });
}

/** Route ctx factory for dynamic `[id]` segments. */
export function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
