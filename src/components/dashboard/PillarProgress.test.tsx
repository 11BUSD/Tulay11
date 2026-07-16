import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PillarProgress } from "./PillarProgress";

describe("<PillarProgress>", () => {
  it("renders the not-started state", () => {
    const { container } = render(
      <PillarProgress status="not_started" percent={0} />,
    );
    const chip = container.querySelector('[data-component-id="pillar-progress"]');
    expect(chip?.getAttribute("data-status")).toBe("not_started");
    expect(chip?.textContent).toContain("0%");
  });

  it("renders the in-progress percent", () => {
    const { container } = render(
      <PillarProgress status="in_progress" percent={40} />,
    );
    const chip = container.querySelector('[data-component-id="pillar-progress"]');
    expect(chip?.getAttribute("data-status")).toBe("in_progress");
    expect(chip?.textContent).toContain("40%");
  });

  it("renders a checkmark when done", () => {
    const { container } = render(<PillarProgress status="done" percent={100} />);
    const chip = container.querySelector('[data-component-id="pillar-progress"]');
    expect(chip?.getAttribute("data-status")).toBe("done");
    expect(chip?.textContent).toContain("✓");
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
