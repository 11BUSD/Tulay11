import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Disclaimer } from "./Disclaimer";

describe("<Disclaimer>", () => {
  it("renders the regulated disclaimer for a regulated pillar", () => {
    render(<Disclaimer pillar="mortgage" />);
    const note = screen.getByRole("note");
    expect(note.dataset.pillar).toBe("mortgage");
    expect(note.dataset.regulated).toBe("true");
    expect(note.textContent).toContain("FSRA");
    expect(note.textContent).toContain("not a mortgage lender");
  });

  it("renders the affiliate disclosure for the general pillar", () => {
    render(<Disclaimer pillar="general" />);
    const note = screen.getByRole("note");
    expect(note.dataset.regulated).toBe("false");
    expect(note.textContent?.toLowerCase()).toContain("referral fee");
  });

  it("marks regulated credit pillar as requiring a licensed referral", () => {
    render(<Disclaimer pillar="credit" />);
    expect(screen.getByRole("note").dataset.regulated).toBe("true");
  });
});
