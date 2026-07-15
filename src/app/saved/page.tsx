import { AppShell } from "@/components/layout/AppShell";
import { SavedView } from "@/components/saved/SavedView";

/**
 * Saved route — the user's saved offers/resources. Data is loaded client-side
 * by {@link SavedView}, keyed by an opaque per-browser subject reference.
 */
export default function SavedPage() {
  return (
    <AppShell>
      <SavedView />
    </AppShell>
  );
}
