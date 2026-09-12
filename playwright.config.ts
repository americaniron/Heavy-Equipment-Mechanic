import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "https://www.fixmyiron.com";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet",
      use: {
        ...devices["iPad (gen 7) landscape"],
        browserName: "chromium",
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
