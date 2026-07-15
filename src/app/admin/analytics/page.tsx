import { AnalyticsView } from "@/components/admin/AnalyticsView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin product-analytics dashboard (Task 23) — activation, pillar funnel,
 * conversion, revenue/user, revenue by partner, payout liability, CAC/LTV and
 * ambassador performance. Rendered under the admin shell + role guard; data is
 * loaded client-side by {@link AnalyticsView} from `GET /api/admin/analytics`.
 */
export default function AdminAnalyticsPage() {
  return <AnalyticsView />;
}
