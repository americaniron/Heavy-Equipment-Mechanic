import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware. Protects everything under /portal/*; everything else
 * (landing, /pricing, /sign-in catch-all) is public. Unauthenticated requests
 * to a protected route are bounced to NEXT_PUBLIC_CLERK_SIGN_IN_URL
 * (accounts.fixmyiron.com/sign-in).
 */
const isProtected = createRouteMatcher(["/portal(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  // Match everything except Next internals + static files.
  // Lifted from the Clerk Next.js docs example.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
