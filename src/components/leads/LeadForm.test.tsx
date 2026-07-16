import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LeadForm } from "./LeadForm";
import type { LeadSubmission } from "@/lib/api/leads";

const submitLead = vi.fn(
  (body: LeadSubmission): Promise<{ consentId: string; status: string }> => {
    void body;
    return Promise.resolve({ consentId: "c1", status: "received" });
  },
);

vi.mock("@/lib/api/leads", () => ({
  submitLead: (body: LeadSubmission) => submitLead(body),
}));

describe("<LeadForm> consent gate (AC3)", () => {
  beforeEach(() => {
    submitLead.mockClear();
  });

  it("keeps submit disabled until the consent checkbox is checked", () => {
    render(<LeadForm pillar="banking" partnerName="Sample Bank" />);

    fireEvent.change(screen.getByPlaceholderText("Maria Santos"), {
      target: { value: "Maria Santos" },
    });
    fireEvent.change(screen.getByPlaceholderText("maria@email.com"), {
      target: { value: "maria@example.com" },
    });

    const submit = screen.getByRole("button", { name: /send my request/i });
    // Name + email present but consent unchecked → still disabled.
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
  });

  it("posts a full ConsentRecord payload on submit", async () => {
    render(<LeadForm pillar="banking" partnerName="Sample Bank" />);

    fireEvent.change(screen.getByPlaceholderText("Maria Santos"), {
      target: { value: "Maria Santos" },
    });
    fireEvent.change(screen.getByPlaceholderText("maria@email.com"), {
      target: { value: "maria@example.com" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /send my request/i }));

    await waitFor(() => expect(submitLead).toHaveBeenCalledTimes(1));
    const payload = submitLead.mock.calls[0][0];
    expect(payload.name).toBe("Maria Santos");
    expect(payload.consent.granted).toBe(true);
    expect(payload.consent.sharedWith).toBe("Sample Bank");
    expect(payload.consent.purpose).toBe("lead_referral");
    expect(payload.consent.basis).toBe("express");
    expect(payload.consent.dataCategories.length).toBeGreaterThan(0);
    expect(payload.consent.consequencesText).toContain("Sample Bank");
    expect(payload.consent.consentTextVersion).toBeTruthy();
  });
});
