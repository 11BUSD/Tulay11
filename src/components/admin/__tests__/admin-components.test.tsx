import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MaskedField } from "../MaskedField";
import { DataTable, type Column } from "../DataTable";
import { ApprovalQueue } from "../ApprovalQueue";
import { RevenueView } from "../RevenueView";
import { PayoutsView } from "../PayoutsView";
import { ApiError } from "@/lib/api/client";
import { REVENUE_DIMENSIONS } from "@/lib/api/admin/revenue";

// --- Mocks for the admin API client modules the views call. -----------------
const listOutreachMessages = vi.fn();
const approveMessage = vi.fn();
const rejectMessage = vi.fn();
vi.mock("@/lib/api/admin/outreach", () => ({
  listOutreachMessages: (...args: unknown[]) => listOutreachMessages(...args),
  approveMessage: (...args: unknown[]) => approveMessage(...args),
  rejectMessage: (...args: unknown[]) => rejectMessage(...args),
}));

const getRevenue = vi.fn();
vi.mock("@/lib/api/admin/revenue", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/admin/revenue")>(
      "@/lib/api/admin/revenue",
    );
  return { ...actual, getRevenue: (...args: unknown[]) => getRevenue(...args) };
});

const listPayouts = vi.fn();
const updatePayoutStatus = vi.fn();
vi.mock("@/lib/api/admin/payouts", () => ({
  listPayouts: (...args: unknown[]) => listPayouts(...args),
  updatePayoutStatus: (...args: unknown[]) => updatePayoutStatus(...args),
}));

// --- MaskedField (AC7 data minimization) ------------------------------------
describe("<MaskedField> masks sensitive values (AC7)", () => {
  it("masks a versioned hash, never revealing the full digest", () => {
    const digest = "a".repeat(64);
    const { container } = render(
      <MaskedField value={`v1:${digest}`} kind="hash" />,
    );
    const el = container.querySelector('[data-masked="hash"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).not.toContain(digest);
    expect(el?.textContent).toContain("v1:");
    expect(el?.textContent).toContain("hashed");
  });

  it("masks an email local part", () => {
    const { container } = render(
      <MaskedField value="alexandra@example.com" kind="email" />,
    );
    const text = container.querySelector('[data-masked="email"]')?.textContent;
    expect(text).not.toBe("alexandra@example.com");
    expect(text).toContain("@example.com");
    expect(text).toContain("•");
    // The raw local part must not appear in full.
    expect(text).not.toContain("alexandra@");
  });

  it("renders an em dash for null", () => {
    const { container } = render(<MaskedField value={null} />);
    expect(container.querySelector('[data-masked="empty"]')?.textContent).toBe(
      "—",
    );
  });
});

// --- DataTable states -------------------------------------------------------
describe("<DataTable> states", () => {
  interface Row {
    id: string;
    name: string;
  }
  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => r.name },
  ];

  it("renders skeleton when loading", () => {
    const { container } = render(
      <DataTable
        testId="t"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        state="loading"
      />,
    );
    expect(container.querySelector('[data-component-id="t-loading"]')).not.toBeNull();
  });

  it("renders an empty state", () => {
    const { container } = render(
      <DataTable
        testId="t"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        state="ready"
        emptyLabel="Nothing here"
      />,
    );
    expect(container.querySelector('[data-component-id="t-empty"]')).not.toBeNull();
  });

  it("renders rows and calls onRetry from the error state", () => {
    const onRetry = vi.fn();
    const { container, rerender } = render(
      <DataTable
        testId="t"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        state="error"
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      <DataTable
        testId="t"
        columns={columns}
        rows={[{ id: "1", name: "Alpha" }]}
        rowKey={(r) => r.id}
        state="ready"
      />,
    );
    expect(container.textContent).toContain("Alpha");
  });
});

// --- ApprovalQueue (AC8 human approval gate) --------------------------------
describe("<ApprovalQueue> human approval gate (AC8)", () => {
  beforeEach(() => {
    listOutreachMessages.mockReset();
    approveMessage.mockReset();
    rejectMessage.mockReset();
  });

  const drafted = {
    id: "msg-1",
    campaign_id: null,
    contact_id: null,
    direction: "outbound",
    subject: null,
    body: null,
    state: "drafted",
    draft_subject: "Partnership intro",
    draft_body: "Hello there",
    draft_reasoning: "High fit prospect",
    draft_confidence: 0.82,
    draft_risk_flags: [],
    sequence_step: 1,
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
    sent_at: null,
    simulated: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  it("only requests drafted messages", async () => {
    listOutreachMessages.mockResolvedValue({ messages: [] });
    render(<ApprovalQueue />);
    await waitFor(() =>
      expect(listOutreachMessages).toHaveBeenCalledWith({ state: "drafted" }),
    );
  });

  it("approves a draft and removes it from the queue", async () => {
    listOutreachMessages.mockResolvedValue({ messages: [drafted] });
    approveMessage.mockResolvedValue({ message: { ...drafted, state: "approved" } });
    const { container } = render(<ApprovalQueue />);

    await screen.findByText("Partnership intro");
    const card = container.querySelector('[data-message-id="msg-1"]')!;
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: /approve/i }),
    );

    await waitFor(() => expect(approveMessage).toHaveBeenCalledWith("msg-1"));
    await waitFor(() =>
      expect(
        container.querySelector('[data-message-id="msg-1"]'),
      ).toBeNull(),
    );
  });

  it("surfaces the 422 blocking-risk-flag rejection without crashing", async () => {
    const blocking = {
      ...drafted,
      draft_risk_flags: [{ code: "casl", severity: "high", message: "No consent" }],
    };
    listOutreachMessages.mockResolvedValue({ messages: [blocking] });
    approveMessage.mockRejectedValue(
      new ApiError("blocked", 422, { code: "blocking_risk_flags" }),
    );
    const { container } = render(<ApprovalQueue />);

    await screen.findByText("Partnership intro");
    const card = container.querySelector('[data-message-id="msg-1"]')!;
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: /approve/i }),
    );

    const alert = await within(card as HTMLElement).findByRole("alert");
    expect(alert.textContent?.toLowerCase()).toContain("blocked");
    // Card stays in the queue since approval was refused.
    expect(container.querySelector('[data-message-id="msg-1"]')).not.toBeNull();
  });

  it("requires a reason to reject and then calls rejectMessage", async () => {
    listOutreachMessages.mockResolvedValue({ messages: [drafted] });
    rejectMessage.mockResolvedValue({ message: { ...drafted, state: "rejected" } });
    const { container } = render(<ApprovalQueue />);

    await screen.findByText("Partnership intro");
    const card = () =>
      container.querySelector('[data-message-id="msg-1"]') as HTMLElement;

    fireEvent.click(within(card()).getByRole("button", { name: /^reject$/i }));
    // Confirm without a reason → validation alert, no API call.
    fireEvent.click(
      within(card()).getByRole("button", { name: /confirm reject/i }),
    );
    await within(card()).findByRole("alert");
    expect(rejectMessage).not.toHaveBeenCalled();

    fireEvent.change(within(card()).getByLabelText(/rejection reason/i), {
      target: { value: "Off-brand tone" },
    });
    fireEvent.click(
      within(card()).getByRole("button", { name: /confirm reject/i }),
    );
    await waitFor(() =>
      expect(rejectMessage).toHaveBeenCalledWith("msg-1", "Off-brand tone"),
    );
  });
});

// --- RevenueView (AC9 six dimensions) ---------------------------------------
describe("<RevenueView> revenue dimensions (AC9)", () => {
  beforeEach(() => {
    getRevenue.mockReset();
    getRevenue.mockResolvedValue({
      groupBy: "pillar",
      total_cents: 100000,
      slices: [{ key: "banking", total_cents: 60000, event_count: 12 }],
      payout_liability: {
        by_status: { pending: 5000, approved: 3000, paid: 2000, rejected: 0 },
        unpaid_cents: 8000,
      },
    });
  });

  it("loads pillar by default", async () => {
    render(<RevenueView />);
    await waitFor(() => expect(getRevenue).toHaveBeenCalledWith("pillar"));
  });

  it("issues the correct groupBy param for every dimension", async () => {
    const { container } = render(<RevenueView />);
    await waitFor(() => expect(getRevenue).toHaveBeenCalledWith("pillar"));

    for (const dim of REVENUE_DIMENSIONS) {
      const pill = container.querySelector(`[data-dimension="${dim}"]`)!
        .closest("button")!;
      fireEvent.click(pill);
      await waitFor(() => expect(getRevenue).toHaveBeenCalledWith(dim));
    }
    // All six dimensions were requested.
    const requested = new Set(getRevenue.mock.calls.map((c) => c[0]));
    for (const dim of REVENUE_DIMENSIONS) expect(requested.has(dim)).toBe(true);
  });

  it("renders the chart rows and payout-liability breakdown", async () => {
    const { container } = render(<RevenueView />);
    await screen.findByText("banking");
    expect(
      container.querySelector('[data-component-id="revenue-chart-row"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-component-id="payout-liability"]'),
    ).not.toBeNull();
  });
});

// --- PayoutsView paid-immutability ------------------------------------------
describe("<PayoutsView> paid payouts are immutable", () => {
  beforeEach(() => {
    listPayouts.mockReset();
    updatePayoutStatus.mockReset();
  });

  const summary = {
    by_status: {
      pending: { total_cents: 5000, count: 1 },
      approved: { total_cents: 0, count: 0 },
      paid: { total_cents: 9000, count: 1 },
      rejected: { total_cents: 0, count: 0 },
    },
    outstanding_liability_cents: 5000,
  };

  it("renders a paid payout as immutable (no approve/reject actions)", async () => {
    listPayouts.mockResolvedValue({
      payouts: [
        { id: "pay-paid", payee_type: "ambassador", amount_cents: 9000, status: "paid" },
      ],
      summary,
    });
    const { container } = render(<PayoutsView />);
    await waitFor(() =>
      expect(container.querySelector('[data-action="immutable"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-action="approve"]')).toBeNull();
    expect(container.querySelector('[data-action="reject"]')).toBeNull();
  });

  it("approves a pending payout", async () => {
    listPayouts.mockResolvedValue({
      payouts: [
        { id: "pay-1", payee_type: "partner", amount_cents: 5000, status: "pending" },
      ],
      summary,
    });
    updatePayoutStatus.mockResolvedValue({
      payout: { id: "pay-1", payee_type: "partner", amount_cents: 5000, status: "approved" },
    });
    const { container } = render(<PayoutsView />);
    await waitFor(() =>
      expect(container.querySelector('[data-action="approve"]')).not.toBeNull(),
    );
    fireEvent.click(container.querySelector('[data-action="approve"]')!);
    await waitFor(() =>
      expect(updatePayoutStatus).toHaveBeenCalledWith("pay-1", "approved"),
    );
  });
});
