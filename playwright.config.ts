import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "https://www.fixmyiron.com";
const invocationId = `${Date.now()}-${process.pid}`;
const rateLimitIdentity = (project: string) =>
  baseURL.includes("127.0.0.1") || process.env.E2E_LOCAL === "1"
    ? { "cf-connecting-ip": `playwright-${project}-${invocationId}` }
    : {};

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
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: rateLimitIdentity("desktop"),
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["iPad (gen 7) landscape"],
        browserName: "chromium",
        extraHTTPHeaders: rateLimitIdentity("tablet"),
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: rateLimitIdentity("mobile"),
      },
    },
  ],
});
