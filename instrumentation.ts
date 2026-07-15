/**
 * Next.js instrumentation hook. `register()` runs once when the server starts,
 * before any route handler or layout resolves an actor — the right place to
 * install the real Supabase-session → admin-actor resolver as the fail-closed
 * default. It only installs on the Node.js server runtime (the resolver reads
 * cookies + queries Postgres, neither available on the edge runtime).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installDefaultActorResolver } = await import(
      "@/lib/auth/bootstrap"
    );
    installDefaultActorResolver();
  }
}
