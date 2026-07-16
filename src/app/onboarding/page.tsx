import { AppShell } from "@/components/layout/AppShell";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

/**
 * Onboarding route — wraps the 3-step {@link OnboardingWizard} client component
 * in the consumer app shell. The wizard collects arrival/city, language and
 * priorities, records the core account consent, and routes to the dashboard.
 */
export default function OnboardingPage() {
  return (
    <AppShell>
      <div className="py-token-3">
        <OnboardingWizard />
      </div>
    </AppShell>
  );
}
