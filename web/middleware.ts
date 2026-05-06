import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Bulletproof middleware for cross-subdomain Clerk session.
 *
 * Why this shape:
 * - clerkMiddleware reads the publishable + secret keys explicitly so it
 *   uses the Clerk Frontend API (clerk.fixmyiron.com) for session
 *   verification regardless of cookie scoping quirks.
 * - Diagnostic logging is preserved so we can see what cookies / headers
 *   reach the Worker if the loop ever recurs.
 * - The redirect target is explicit (no relative URL guessing).
 */
const isProtectedRoute = createRouteMatcher(["/portal(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isProtectedRoute(req)) return NextResponse.next();

    const { userId } = await auth();

    if (!userId) {
      const cookieHeader = req.headers.get("cookie") ?? "";
      const cookieKeys = cookieHeader
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);

      console.log("middleware-no-session", {
        url: req.url,
        cookieKeys,
        hasAuthHeader: !!req.headers.get("authorization"),
      });

      const signInUrl = new URL("https://accounts.fixmyiron.com/sign-in");
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  },
  {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }
);

export const config = {
  matcher: ["/portal/:path*"],
};
