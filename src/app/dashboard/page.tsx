import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";

/**
 * Dashboard route — settlement progress across the 10 pillars. The data is
 * fetched client-side by {@link DashboardView} from `GET /api/pillars`, which
 * keeps this route static and handles loading/error/empty states in the view.
 */
export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
