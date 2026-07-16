import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfferCard } from "./OfferCard";
import type { Recommendation } from "@/lib/api/offers";
import type { RegulatedDisclaimerDto } from "@/components/disclosure/RegulatedDisclaimer";

function makeOffer(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    partner_id: "22222222-2222-2222-2222-222222222222",
    title: "Newcomer Chequing",
    settlement_pillar: "banking",
    destination_url: "https://example.com/offer",
    tracking_code: "TRK-1",
    offer_type: "signup",
    priority_score: 10,
    commission_type: "fixed",
    user_reward_value_cents: 5000,
    city_targets: [],
    language_targets: [],
    partner: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Sample Bank",
      category: "banking",
      website: "https://example.com",
      license_verified: false,
    },
    regulated: false,
    requires_licensed_referral: false,
    license_verified: false,
    ...overrides,
  };
}

const disclaimer: RegulatedDisclaimerDto = {
  pillar: "insurance",
  regulator: "FSRA",
  body: "Informational only — not advice.",
  requires_licensed_referral: true,
};

describe("<OfferCard>", () => {
  it("always renders the partner disclosure (AC1)", () => {
    render(<OfferCard offer={makeOffer()} disclaimer={disclaimer} />);
    expect(
      screen.getByText(/Tulay may earn a referral fee/i),
    ).toBeInTheDocument();
  });

  it("does NOT render a regulated disclaimer for a non-regulated offer", () => {
    const { container } = render(
      <OfferCard offer={makeOffer({ regulated: false })} disclaimer={disclaimer} />,
    );
    expect(
      container.querySelector('[data-component-id="regulated-disclaimer"]'),
    ).toBeNull();
  });

  it("renders the regulated disclaimer for a regulated offer (AC2)", () => {
    const { container } = render(
      <OfferCard offer={makeOffer({ regulated: true })} disclaimer={disclaimer} />,
    );
    const note = container.querySelector(
      '[data-component-id="regulated-disclaimer"]',
    );
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain("FSRA");
  });

  it("formats the reward when cents arrive as a bigint string (node-postgres)", () => {
    // node-postgres returns bigint columns as strings over JSON; the card must
    // coerce before formatting rather than throwing.
    render(
      <OfferCard
        offer={makeOffer({
          user_reward_value_cents: "2500" as unknown as number,
        })}
        disclaimer={disclaimer}
      />,
    );
    expect(screen.getByText(/\$25\.00/)).toBeInTheDocument();
  });
});
