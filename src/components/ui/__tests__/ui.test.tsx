import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";
import { Badge } from "../Badge";
import { Progress } from "../Progress";
import { Checkbox } from "../Checkbox";

describe("Button", () => {
  it("renders children and handles clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-danger",
    );
  });
});

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge variant="success">Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("clamps the value and exposes aria attributes", () => {
    render(<Progress value={150} label="Settlement progress" />);
    const bar = screen.getByRole("progressbar", {
      name: "Settlement progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("Checkbox", () => {
  it("renders an associated label and toggles", () => {
    render(<Checkbox id="consent" label="I agree" />);
    const box = screen.getByLabelText("I agree") as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
  });
});
