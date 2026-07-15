import { AppShell } from "@/components/layout/AppShell";
import { ProfileView } from "@/components/profile/ProfileView";

/**
 * The seeded demo consumer profile id. Until Supabase-Auth session wiring
 * lands, the profile page operates on this known profile (the pattern the rest
 * of the app uses today).
 */
const DEMO_PROFILE_ID = "44444444-4444-4444-4444-444444444402";

/**
 * Profile route — profile view/edit plus the PIPEDA export/delete privacy
 * panel, rendered by the client {@link ProfileView}.
 */
export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileView profileId={DEMO_PROFILE_ID} />
    </AppShell>
  );
}
