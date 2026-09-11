import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Native FixMyIron auth lives on the production Vite SPA.
 * Do not send users to Clerk Account Portal / accounts.fixmyiron.com.
 */
const isProtectedRoute = createRouteMatcher(["/portal(.*)"]);
const NATIVE_LOGIN = "https://www.fixmyiron.com/login";

export default clerkMiddleware(
  async (auth, req) => {
    if (!isProtectedRoute(req)) return NextResponse.next();

    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL(NATIVE_LOGIN);
      signInUrl.searchParams.set("redirect", req.url);
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
  matcher: ["/portal(.*)", "/"],
};
