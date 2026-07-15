import { test, expect } from "@playwright/test";

// Minimal baseline smoke test. Real E2E flows are added by later tasks.
test("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
