/**
 * <AnalyticsView> render test (Task 23) — with mocked metrics, the dashboard
 * renders KPI tiles (users/activation/conversion/revenue/CAC/LTV), the pillar
 * funnel, revenue-by-partner and ambassador performance, formatting money from
 * integer cents.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { AnalyticsView } from "../AnalyticsView";
import type { AnalyticsResponse } from "@/lib/api/admin/analytics";

const getAnalytics = vi.fn();
vi.mock("@/lib/api/admin/analytics", () => ({
  getAnalytics: (...args: unknown[]) => getAnalytics(...args),
}));

const MOCK: AnalyticsResponse = {
  users: 120,
  activated_users: 84,
  activation_rate: 0.7,
  offer_impressions: 500,
  clicks: 500,
  conversions: 25,
  conversion_rate: 0.05,
  revenue_cents: 1_250_00,
  revenue_per_user_cents: 1041,
  payout_liability_cents: 300_00,
  cac_cents: 1500,
  ltv_cents: 1041,
  ltv_to_cac: 0.69,
  pillar_funnel: [{ pillar: "banking", starts: 200, completions: 15 }],
  revenue_by_partner: [{ partner: "Sample Bank", revenue_cents: 900_00 }],
  ambassadors: [
    {
      ambassador: "Maria",
      referrals: 12,
      attributed_cents: 400_00,
      paid_cents: 100_00,
    },
  ],
  estimated: ["offer_impressions", "cac_cents", "ltv_cents", "ltv_to_cac"],
};

beforeEach(() => {
  getAnalytics.mockReset();
});

describe("<AnalyticsView>", () => {
  it("renders KPI tiles + tables from mocked metrics", async () => {
    getAnalytics.mockResolvedValue(MOCK);
    render(<AnalyticsView />);

    await waitFor(() =>
      expect(
        document.querySelector('[data-component-id="metric-users"]'),
      ).not.toBeNull(),
    );

    // Users tile shows the count.
    const usersTile = document.querySelector(
      '[data-component-id="metric-users"]',
    ) as HTMLElement;
    expect(within(usersTile).getByText("120")).toBeTruthy();

    // Activation rate as a percentage.
    const activation = document.querySelector(
      '[data-component-id="metric-activation"]',
    ) as HTMLElement;
    expect(within(activation).getByText("70.0%")).toBeTruthy();

    // Revenue as dollars (integer cents → $1,250.00).
    const revenue = document.querySelector(
      '[data-component-id="metric-revenue"]',
    ) as HTMLElement;
    expect(revenue.textContent).toContain("$1,250.00");

    // Funnel + partner + ambassador sections render their rows.
    expect(
      document.querySelector('[data-component-id="pillar-funnel"]'),
    ).not.toBeNull();
    expect(screen.getByText("banking")).toBeTruthy();
    expect(screen.getByText("Sample Bank")).toBeTruthy();
    expect(screen.getByText("Maria")).toBeTruthy();
  });

  it("shows an error state + retry when the load fails", async () => {
    getAnalytics.mockRejectedValue(new Error("boom"));
    render(<AnalyticsView />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/could not load analytics/i)).toBeTruthy();
  });
});
