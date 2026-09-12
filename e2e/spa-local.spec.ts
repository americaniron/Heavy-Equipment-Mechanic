import { test, expect } from "@playwright/test";

const isLocal = (process.env.E2E_BASE_URL || "").includes("127.0.0.1") || process.env.E2E_LOCAL === "1";

test.describe("local SPA native auth", () => {
  test.skip(!isLocal, "Requires a local Vite preview (E2E_BASE_URL=http://127.0.0.1:4173)");

  test("/register opens the native create-account form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("input-first-name")).toBeVisible();
    await expect(page.getByTestId("heading-auth")).toHaveText(/create account/i);
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });

  test("/login stays on FixMyIron and can return home", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("input-email")).toBeVisible();
    await page.getByTestId("link-back-home").click();
    await expect(page.getByTestId("landing-page")).toBeVisible();
  });

  test("forgot-password uses the native reset form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByTestId("input-forgot-email")).toBeVisible();
    await expect(page.getByTestId("button-send-reset")).toBeVisible();
  });

  test("anonymous users can start text diagnosis after consent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-page")).toBeVisible();
    await page.getByTestId("checkbox-consent").scrollIntoViewIfNeeded();
    await page.getByTestId("checkbox-consent").click();
    await expect(page.getByTestId("button-start-text-diagnosis")).toBeEnabled();
  });

  test("portal without a session stays on FixMyIron", async ({ page }) => {
    await page.goto("/portal");
    await page.waitForTimeout(800);
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });
});
