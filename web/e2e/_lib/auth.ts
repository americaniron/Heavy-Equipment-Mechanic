import type { Page } from "@playwright/test";
import type { test as Test } from "@playwright/test";

/**
 * Returns a Clerk session token if one is available in the environment,
 * else null. Tests that need an authenticated session call
 * `requireSessionToken(test)` to skip with a clear reason when absent.
 *
 * To run the full auth'd suite locally:
 *   1. Sign in to https://fixmyiron-web-staging.americanironadmin.workers.dev/sign-in
 *      via your Clerk hosted Account Portal.
 *   2. Open DevTools → Application → Cookies → __session (or use
 *      Clerk's getToken() in a quick console snippet).
 *   3. export TEST_CLERK_SESSION_TOKEN="<the JWT>"
 *   4. cd web && npx playwright test
 *
 * The token is short-lived (~1 hour by default), so refresh as needed.
 */
export function getSessionToken(): string | null {
  const t = process.env.TEST_CLERK_SESSION_TOKEN ?? "";
  return t.trim() || null;
}

export function requireSessionToken(test: Test): string {
  const token = getSessionToken();
  test.skip(
    !token,
    "TEST_CLERK_SESSION_TOKEN env var not set — skipping auth'd test. " +
      "See e2e/_lib/auth.ts for setup steps.",
  );
  return token!;
}

/**
 * Inject a Clerk session JWT as a Bearer token on every API request the
 * page makes via fetch(). Works because our API client (web/lib/api.ts)
 * sends the Bearer header by default; this just makes Playwright route
 * the request and add it.
 */
export async function attachClerkBearer(page: Page, token: string): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${token}`,
    };
    await route.continue({ headers });
  });
}
