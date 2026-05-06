import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk middleware — runs ONLY on /portal/* and below. Public marketing
 * pages (/, /pricing, /sign-in) deliberately bypass this so they can
 * serve without the Clerk publishable key being set in the environment.
 *
 * Signed-out visitors get a 307 redirect to NEXT_PUBLIC_CLERK_SIGN_IN_URL
 * (accounts.fixmyiron.com/sign-in). We use redirectToSignIn() instead of
 * auth.protect() because protect() defaults to "rewrite-to-404" to obscure
 * protected routes — that surfaced as a confusing 404 instead of a sign-in
 * prompt during cutover testing.
 */
export default clerkMiddleware(async (auth) => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }
});

export const config = {
  matcher: ["/portal/:path*"],
};
