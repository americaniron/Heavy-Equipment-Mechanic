import { test, expect } from "@playwright/test";

test.describe("public marketing pages", () => {
  test("landing renders with monetization banner", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/fixmyiron/i);
    // The landing has multiple "Sign up free/FREE" elements (banner +
    // hero CTA + portal redirect). Pin the banner via its region role
    // and assert the exact-case marketing copy lives inside it.
    const banner = page.getByRole("region", { name: /pricing notice/i });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Sign up FREE");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("pricing page shows three tiers + early-access mailto", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /^Pricing$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Free" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
    await expect(page.locator("text=$49")).toBeVisible();
    await expect(page.locator("text=$199")).toBeVisible();
    // Pro/Shop CTAs are mailto in deferred-Paddle mode.
    const mailtoLinks = await page.locator('a[href^="mailto:adam@americaniron1.com"]').count();
    expect(mailtoLinks).toBeGreaterThanOrEqual(2);
  });

  test("monetization banner is dismissible and persists in localStorage", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: /pricing notice/i });
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: /dismiss pricing notice/i }).click();
    await expect(banner).toBeHidden();

    // Reload — banner stays dismissed.
    await page.reload();
    await expect(page.getByRole("region", { name: /pricing notice/i })).toHaveCount(0);

    // Verify localStorage flag.
    const flag = await page.evaluate(() =>
      window.localStorage.getItem("fmi.banner.dismissed.v2026-05"),
    );
    expect(flag).toBe("1");
  });
});
