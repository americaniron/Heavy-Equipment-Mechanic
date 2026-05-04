import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk middleware — runs ONLY on /portal/* and below. Public marketing
 * pages (/, /pricing, /sign-in) deliberately bypass this so they can
 * serve without the Clerk publishable key being set in the environment.
 *
 * Any request to /portal/* without a valid Clerk session gets bounced to
 * NEXT_PUBLIC_CLERK_SIGN_IN_URL (accounts.fixmyiron.com/sign-in).
 */
export default clerkMiddleware(async (auth) => {
  await auth.protect();
});

export const config = {
  matcher: ["/portal/:path*"],
};
