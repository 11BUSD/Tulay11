import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "./env";

/**
 * Server Supabase client bound to the request cookie store — use in Server
 * Components, Server Actions, and Route Handlers where the user's session
 * should apply (RLS enforced as the signed-in user).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` can be called from a Server Component where mutating
          // cookies is not allowed; safe to ignore when middleware refreshes.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client for trusted server-side work in API routes
 * (bypasses RLS). NEVER import this into client code. Lazily created.
 */
export function createServiceRoleClient() {
  return createServerClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Service-role client is stateless — no cookie persistence.
      },
    },
  });
}
