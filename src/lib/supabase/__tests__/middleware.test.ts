// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { updateSession, isProtectedPath } from "../middleware";

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const req = new NextRequest(new URL(`http://localhost:3000${pathname}`));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("isProtectedPath", () => {
  it("flags protected prefixes", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
    expect(isProtectedPath("/admin/partners")).toBe(true);
  });

  it("allows public paths", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/pillars/banking")).toBe(false);
  });
});

describe("updateSession", () => {
  it("redirects an unauthenticated request to a protected route to /login", async () => {
    const res = await updateSession(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    const url = new URL(location);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirectTo")).toBe("/dashboard");
  });

  it("does not redirect an authenticated request", async () => {
    const res = await updateSession(
      makeRequest("/dashboard", {
        "sb-localhost-auth-token": "some-session-value",
      }),
    );
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not redirect public routes", async () => {
    const res = await updateSession(makeRequest("/"));
    expect(res.headers.get("location")).toBeNull();
  });
});
