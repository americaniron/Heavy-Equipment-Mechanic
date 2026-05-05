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
 * Acceptance: any non-5xx, with EITHER the x-clerk-auth-status
 * header set (rewrite path) OR a Location header pointing at
 * accounts.fixmyiron.com (redirect path). 500 is the failure mode
 * we're guarding against (publishable key missing, etc.).
 */
test.describe("portal pages — anonymous behavior (no auto-redirect)", () => {
  for (const p of PORTAL_PATHS) {
    test(`GET ${p} — Clerk gate fires, no 5xx`, async () => {
      const ctx = await request.newContext({ baseURL: WEB, maxRedirects: 0 });
      const res = await ctx.get(p);
      const status = res.status();
      const headers = res.headers();
      const clerkHeader = headers["x-clerk-auth-status"];
      const location = headers["location"] ?? "";

      // Never a server error.
      expect(status, `unexpected 5xx for ${p}`).toBeLessThan(500);

      // EITHER: the response carries our Clerk middleware header
      // (rewrite path — typically 404)…
      // OR: it's a redirect to the Clerk hosted sign-in
      // (accounts.fixmyiron.com).
      const okClerkHeader = !!clerkHeader;
      const okClerkRedirect =
        status >= 300 &&
        status < 400 &&
        /accounts\.fixmyiron\.com|clerk\./.test(location);
      expect(
        okClerkHeader || okClerkRedirect,
        `Clerk gate did not fire for ${p}: status=${status} clerkHeader=${clerkHeader} location=${location}`,
      ).toBe(true);

      await ctx.dispose();
    });
  }
});
