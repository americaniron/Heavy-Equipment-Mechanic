import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — runs against the LIVE staging Cloudflare Workers.
 * No mocks. No local web server.
 *
 * Auth-gated tests look for TEST_CLERK_SESSION_TOKEN in the env. When
 * absent (the default for unattended runs), they're marked `test.skip`
 * with a clear reason rather than failing — see e2e/_lib/auth.ts.
 */
const STAGING_WEB =
  process.env.STAGING_WEB_URL ??
  "https://fixmyiron-web-staging.americanironadmin.workers.dev";
const STAGING_API =
  process.env.STAGING_API_URL ??
  "https://fixmyiron-api-staging.americanironadmin.workers.dev";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // serialize to keep AI rate-limit usage predictable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: STAGING_WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "x-fmi-test-source": "playwright-e2e",
    },
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],
  metadata: {
    stagingWebUrl: STAGING_WEB,
    stagingApiUrl: STAGING_API,
  },
});
