import { expect, test } from "@playwright/test";

const isLocal =
  (process.env.E2E_BASE_URL || "").includes("127.0.0.1") ||
  process.env.E2E_LOCAL === "1";

const visit = {
  id: 71,
  customerName: "Demo Operator",
  customerEmail: "demo@fixmyiron.test",
  customerPhone: "+15555550100",
  company: "FixMyIron Test",
  equipmentType: "Excavator",
  make: "CAT",
  model: "320F",
  year: "2020",
  serialNumber: "CAT-E2E",
  problemSummary: "Hydraulic pressure drops under load",
  faultCodes: "E361",
  visitType: "quick_advice",
  mechanicType: "heavy_equipment",
  status: "completed",
  language: "en",
  createdAt: "2026-09-12T10:00:00.000Z",
  emailVerified: true,
  phoneVerified: false,
  hasReport: true,
};

test.describe("admin UI contracts", () => {
  test.skip(!isLocal, "Requires the local Vite SPA");

  test("login, dashboard, visits, detail, customers, reload, and logout work responsively", async ({ page }) => {
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/admin/login") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "admin-e2e-token", expiresIn: 28800 }) });
      } else if (path === "/api/admin/logout") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      } else if (path === "/api/admin/dashboard") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ totalVisits: 1, completedVisits: 1, activeVisits: 0, uniqueCustomers: 1, registeredCustomers: 1, visitsByType: { heavy_equipment: 1 }, recentVisits: [visit] }),
        });
      } else if (path === "/api/admin/visits") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([visit]) });
      } else if (path === "/api/admin/visits/71") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: visit,
            messages: [{ role: "user", content: "Pressure is low", createdAt: "2026-09-12T10:01:00.000Z" }],
            report: { reportType: "diagnostic", shareToken: "share-e2e", content: { summary: "Inspect filter" } },
            visitLog: null,
          }),
        });
      } else if (path === "/api/admin/customers") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ id: 1, firstName: "Demo", lastName: "User", email: "demo@fixmyiron.test", phone: "+15555550100", company: "FixMyIron Test", status: "active", createdAt: "2026-09-12T09:00:00.000Z" }]),
        });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
      }
    });

    await page.goto("/admin");
    await page.getByTestId("input-admin-password").fill("test-password");
    await page.getByTestId("button-admin-login").click();
    await expect(page.getByTestId("stat-total-visits")).toContainText("1");
    expect(page.url()).not.toContain("admin-e2e-token");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("adminToken"))).toBeNull();

    await page.getByTestId("button-tab-visits").click();
    await page.getByTestId("input-visit-search").fill("hydraulic");
    await page.getByTestId("card-visit-71").click();
    await expect(page.getByTestId("text-detail-equipment")).toContainText("Excavator");
    await expect(page.getByText("Inspect filter")).toBeVisible();
    await expect(page.locator('a[href="/?shared=share-e2e"]')).toHaveAttribute("rel", /noopener/);
    await page.getByTestId("button-back-to-list").click();

    await page.getByTestId("button-tab-customers").click();
    await expect(page.getByTestId("card-customer-1")).toContainText("demo@fixmyiron.test");

    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(sizes.document).toBeLessThanOrEqual(sizes.viewport + 1);

    await page.reload();
    await expect(page.getByTestId("stat-total-visits")).toContainText("1");
    await page.getByTestId("button-admin-logout").click();
    await expect(page.getByTestId("button-admin-login")).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixmyiron:admin-token"))).toBeNull();
  });
});

test.describe("real local admin API", () => {
  test.skip(!isLocal, "Requires the local Vite SPA and API");
  test.skip(!process.env.E2E_ADMIN_PASSWORD, "Set E2E_ADMIN_PASSWORD from the gitignored local dev vars");

  test("shared password mints a short-lived session and opens real dashboard data", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One real admin API pass is sufficient");
    const session = await request.post("/api/sessions", { data: { consentGiven: true, language: "en" } });
    expect(session.ok()).toBeTruthy();

    await page.goto("/admin");
    await page.getByTestId("input-admin-password").fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByTestId("button-admin-login").click();
    await expect(page.getByTestId("stat-total-visits")).toBeVisible();
    await page.getByTestId("button-tab-visits").click();
    const firstVisit = page.locator('[data-testid^="card-visit-"]').first();
    await expect(firstVisit).toBeVisible();
    await firstVisit.click();
    await expect(page.getByTestId("button-back-to-list")).toBeVisible();
    await page.getByTestId("button-back-to-list").click();
    await page.getByTestId("button-tab-customers").click();
    await expect(page.getByTestId("card-customer-1")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("stat-total-visits")).toBeVisible();
    await page.getByTestId("button-admin-logout").click();
    await expect(page.getByTestId("button-admin-login")).toBeVisible();
  });
});
