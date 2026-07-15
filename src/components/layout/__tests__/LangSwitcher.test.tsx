import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangSwitcher } from "../LangSwitcher";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

const refresh = vi.fn();
let currentLocale = "en";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  useTranslations: () => (key: string) => key,
}));

describe("LangSwitcher", () => {
  beforeEach(() => {
    refresh.mockClear();
    currentLocale = "en";
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
  });

  it("renders both locale options with the active one pressed", () => {
    render(<LangSwitcher />);
    expect(screen.getByRole("button", { name: /EN/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /TL/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("persists the selected locale to a cookie and refreshes on toggle", () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /TL/ }));
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=tl`);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh when selecting the already-active locale", () => {
    render(<LangSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /EN/ }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
