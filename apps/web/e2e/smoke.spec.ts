import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("SeatLock board and Race Lab work", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173/");

  await expect(page.getByText("Open teams")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Request a seat" }).click();
  await expect(page.getByRole("status")).toContainText("Join request created");

  await page.goto("http://127.0.0.1:5173/lab");
  await expect(page.getByText("One seat. Fifty attempts.")).toBeVisible();

  await page.getByRole("button", { name: "Fire 50 joins" }).click();
  await expect(page.getByText("PROOF PASSED")).toBeVisible({ timeout: 30000 });
});