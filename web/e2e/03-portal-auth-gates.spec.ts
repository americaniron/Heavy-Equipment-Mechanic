import { test, expect, request } from "@playwright/test";

const WEB =
  process.env.STAGING_WEB_URL ??
  "https://fixmyiron-web-staging.americanironadmin.workers.dev";

const PORTAL_PATHS = [
  "/portal",
  "/portal/parts",
  "/portal/diagnosis",
  "/portal/troubleshooting",
  "/portal/recommended-parts",
  "/portal/repair-plan",
  "/portal/predictive",
  "/portal/equipment",
  "/portal/fault-codes",
  "/portal/billing",
];

/**
 * Anonymous portal probes. We use the Playwright request API (NOT
 * page.goto) so we can inspect the FIRST response in the chain and
 * verify Clerk middleware fired, even when it issues a 30x to the
 * hosted sign-in URL. Following redirects (which page.goto does)
 * lands us on accounts.fixmyiron.com whose response doesn't carry
 * our middleware headers.
 *
 * Native FixMyIron login. Clerk identity stays behind the SPA.
 * Do not require accounts.fixmyiron.com.
 */
test.describe("portal pages — anonymous behavior (no auto-redirect)", () => {
  for (const p of PORTAL_PATHS) {
    test(`GET ${p} — auth gate fires, no 5xx`, async () => {
      const ctx = await request.newContext({ baseURL: WEB, maxRedirects: 0 });
      const res = await ctx.get(p);
      const status = res.status();
      const headers = res.headers();
      const clerkHeader = headers["x-clerk-auth-status"];
      const location = headers["location"] ?? "";

      expect(status, `unexpected 5xx for ${p}`).toBeLessThan(500);

      const okClerkHeader = !!clerkHeader;
      const okAuthRedirect =
        status >= 300 &&
        status < 400 &&
        /fixmyiron\.com\/(login|register)|accounts\.fixmyiron\.com|clerk\./.test(location);
      expect(
        okClerkHeader || okAuthRedirect,
        `Auth gate did not fire for ${p}: status=${status} clerkHeader=${clerkHeader} location=${location}`,
      ).toBe(true);

      await ctx.dispose();
    });
  }
});
