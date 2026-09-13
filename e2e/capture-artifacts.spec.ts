import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";

const isLocal =
  (process.env.E2E_BASE_URL || "").includes("127.0.0.1") ||
  process.env.E2E_LOCAL === "1";
const artifactRoot = "/opt/cursor/artifacts/frontend-repair/screenshots";

test.describe("frontend repair artifact capture", () => {
  test.skip(!isLocal, "Requires local Vite + API");

  const demo = { email: "demo@fixmyiron.test", password: "Password123" };

  async function shot(page: Page, name: string) {
    await page.screenshot({
      path: path.join(artifactRoot, `${name}.png`),
      fullPage: true,
    });
  }

  async function login(page: Page, request: APIRequestContext) {
    const response = await request.post("/api/auth/login", { data: demo });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const token = data.authToken || data.token;
    await page.addInitScript((authToken) => localStorage.setItem("authToken", authToken), token);
  }

  test("capture desktop auth, portal, and admin flows", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One artifact set is sufficient");

    await page.goto("/");
    await expect(page.getByTestId("landing-page")).toBeVisible();
    await shot(page, "desktop-home");

    await page.goto("/login");
    await shot(page, "desktop-login");

    await login(page, request);
    await page.goto("/portal/dashboard");
    await expect(page.getByTestId("text-section-title")).toHaveText("Dashboard");
    await shot(page, "desktop-portal-dashboard");

    await page.goto("/portal/equipment");
    await expect(page.getByTestId("text-section-title")).toHaveText("My Equipment");
    await shot(page, "desktop-portal-equipment");

    await page.goto("/admin");
    await page.getByTestId("input-admin-password").fill(process.env.E2E_ADMIN_PASSWORD || "dev-admin");
    await page.getByTestId("button-admin-login").click();
    await expect(page.getByTestId("stat-total-visits")).toBeVisible();
    await shot(page, "desktop-admin-dashboard");
  });

  test("capture tablet and mobile portal navigation", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "desktop", "Desktop captured separately");
    await login(page, request);
    await page.goto("/portal");
    await expect(page.getByTestId("text-section-title")).toBeVisible();
    const menu = page.getByTestId("button-open-sidebar");
    if (await menu.isVisible()) await menu.click();
    await shot(page, `${testInfo.project.name}-portal-nav`);
  });
});
