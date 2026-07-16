import { OverviewView } from "@/components/admin/OverviewView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin overview (Task 19) — operator home per `overview-analytics.html`:
 * metric cards, revenue-by-pillar/partner/channel breakdowns, and a governance
 * banner linking the outreach approval queue + audit log. Data is loaded
 * client-side by {@link OverviewView} from the admin revenue + payouts routes.
 */
export default function AdminOverviewPage() {
  return <OverviewView />;
}
