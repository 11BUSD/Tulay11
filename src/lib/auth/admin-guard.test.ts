import { afterEach, describe, expect, it } from "vitest";
import {
  requireAdmin,
  requireRole,
  AuthError,
} from "@/lib/auth/admin-guard";
import {
  resetActorResolver,
  setActorResolver,
  type Actor,
} from "@/lib/auth/roles";

function actor(role: Actor["role"]): Actor {
  return { id: "user-1", role, actorType: "human" };
}

afterEach(() => resetActorResolver());

describe("admin-guard", () => {
  it("throws 401 when there is no actor", async () => {
    setActorResolver(async () => null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(AuthError);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when the actor is not an admin", async () => {
    setActorResolver(async () => actor("user"));
    await expect(requireAdmin()).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("returns the actor for an admin", async () => {
    setActorResolver(async () => actor("admin"));
    const a = await requireAdmin();
    expect(a.role).toBe("admin");
  });

  it("requireRole enforces an arbitrary role", async () => {
    setActorResolver(async () => actor("ambassador"));
    await expect(requireRole("ambassador")).resolves.toMatchObject({
      role: "ambassador",
    });
    await expect(requireRole("admin")).rejects.toMatchObject({ status: 403 });
  });
});
