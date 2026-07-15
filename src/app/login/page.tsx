import { AppShell } from "@/components/layout/AppShell";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

/**
 * Placeholder login page. Protected routes redirect here when unauthenticated.
 * The magic-link / OTP Supabase Auth flow is built in a later task.
 */
export default function LoginPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-sm py-token-4">
        <Card>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Authentication is coming soon. This placeholder confirms the
            protected-route redirect works.
          </CardDescription>
        </Card>
      </div>
    </AppShell>
  );
}
