import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";

const isLocal =
  (process.env.E2E_BASE_URL || "").includes("127.0.0.1") ||
  process.env.E2E_LOCAL === "1";
const localRateLimitHeaders = isLocal
  ? { "cf-connecting-ip": `playwright-anonymous-${Date.now()}-${process.pid}` }
  : {};

test.describe("production anonymous SPA", () => {
  test.use({ extraHTTPHeaders: localRateLimitHeaders });

  test("homepage is the native FixMyIron live desk", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/FixMyIron/i);
    await expect(page.locator("#root")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId("landing-page")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("text-brand-name")).toContainText(/TALK TO A MECHANIC/i);
    const html = await page.content();
    expect(html).not.toMatch(/accounts\.fixmyiron\.com/);
    expect(html).not.toMatch(/index-Ca7Toeun\.js/);
  });

  test("native login form stays on FixMyIron", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("input-email")).toBeVisible();
    await expect(page.getByTestId("input-password")).toBeVisible();
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });

  test("native register form stays on FixMyIron", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("input-first-name")).toBeVisible();
    await expect(page.getByTestId("heading-auth")).toHaveText(/create account/i);
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });

  test("portal without a session does not use Clerk hosted pages", async ({ page }) => {
    await page.goto("/portal");
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });

  test("consent starts a native text diagnosis session", async ({ page, context }) => {
    await context.grantPermissions(["microphone"]);
    await page.goto("/");
    await expect(page.getByTestId("landing-page")).toBeVisible();
    await page.getByTestId("checkbox-consent").scrollIntoViewIfNeeded();
    await page.getByTestId("checkbox-consent").click();
    await expect(page.getByTestId("button-start-text-diagnosis")).toBeEnabled();
    await page.getByTestId("button-start-text-diagnosis").click();
    await expect(page.getByTestId("live-desk-active")).toBeVisible({ timeout: 45_000 });
    expect(page.url()).not.toContain("accounts.fixmyiron.com");
  });
});

test.describe("production API", () => {
  let productionApi: APIRequestContext;

  test.beforeAll(async () => {
    // Local projects carry a synthetic Cloudflare identity to isolate D1 rate
    // limits. Never forward that local-only header to the production API.
    productionApi = await playwrightRequest.newContext();
  });

  test.afterAll(async () => {
    await productionApi.dispose();
  });

  test("health is reachable", async () => {
    const res = await productionApi.get("https://api.fixmyiron.com/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.env).toBe("production");
    expect(body.billing).toBe("stripe");
  });

  test("Paddle webhook path is gone", async () => {
    const res = await productionApi.post("https://api.fixmyiron.com/api/webhooks/paddle", {
      data: {},
    });
    expect(res.status()).toBe(410);
  });

  test("feature APIs are not Caterpillar-gated", async () => {
    const res = await productionApi.get("https://api.fixmyiron.com/api/fault-codes/search?q=100");
    const body = await res.json();
    const code = body?.error?.code ?? body?.code;
    expect(code).not.toBe("OFFICIAL_SOURCE_REQUIRED");
    expect(res.status()).not.toBe(503);
  });

  test("anonymous text diagnosis can create a session", async () => {
    const res = await productionApi.post("https://api.fixmyiron.com/api/sessions", {
      data: { consentGiven: true, language: "en" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.accessToken).toBeTruthy();
  });
});
