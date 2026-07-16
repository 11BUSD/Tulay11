/**
 * Server-side helpers shared by the API route handlers.
 *
 * Keeps error→HTTP mapping in one place so every route responds consistently:
 *   - `AuthError` (401/403) from the admin guard,
 *   - `ConsentRequiredError` (403) from the consent layer,
 *   - zod validation failures (400),
 *   - everything else (500).
 *
 * Route handlers do their happy-path work and call `handleRouteError` in a
 * catch, so guard/consent/validation errors thrown deep in lib code surface as
 * the right status without each route re-implementing the mapping.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/admin-guard";
import { ConsentRequiredError } from "@/lib/compliance/consent";

/** A structured error carrying an explicit HTTP status. */
export class HttpError extends Error {
  readonly status: number;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.extra = extra;
  }
}

/** Build a JSON error response. */
export function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Parse a JSON request body, throwing an `HttpError(400)` on malformed input. */
export async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/**
 * Map a thrown error to a JSON response. Known typed errors get their specific
 * status; unknown errors become a 500 (message included so tests can assert).
 */
export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return jsonError(err.status, err.message, { code: err.code });
  }
  if (err instanceof ConsentRequiredError) {
    return jsonError(err.status, err.message, { code: err.code });
  }
  if (err instanceof ZodError) {
    return jsonError(400, "Validation failed", { issues: err.flatten() });
  }
  if (err instanceof HttpError) {
    return jsonError(err.status, err.message, err.extra);
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return jsonError(500, message);
}

/**
 * Build a parameterised `where` clause from a list of `[column, value]`
 * filters. Skips absent filters (null / undefined / empty string) so callers
 * can pass `searchParams.get(...)` results directly; keeps boolean `false`.
 * Placeholders are numbered `$1..$n` in the order retained, so the returned
 * `params` line up positionally. Callers may push additional params (e.g.
 * limit/offset) onto the returned array afterwards.
 *
 * @example
 *   const { where, params } = buildWhere([
 *     ["status", status],
 *     ["filipino_focus", filipino != null ? filipino === "true" : null],
 *   ]);
 *   db.query(`select * from partners ${where} order by created_at desc`, params);
 */
export function buildWhere(
  filters: Array<[column: string, value: unknown]>,
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of filters) {
    if (value === null || value === undefined || value === "") continue;
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  return { where, params };
}

/** Best-effort client IP from proxy headers (hashed downstream, never raw). */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}
