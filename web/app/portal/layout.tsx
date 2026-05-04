import { ClerkProvider } from "@clerk/nextjs";
import { publicEnv } from "@/lib/env";

/**
 * Auth-gated portal shell.
 *
 * ClerkProvider lives here (not in the root layout) so public marketing
 * pages can prerender without the publishable key. Middleware.ts enforces
 * the actual auth gate; this layout only renders chrome — if the user
 * isn't signed in they've already been bounced by middleware before
 * this component runs.
 *
 * The portal subtree is forced dynamic (the parts page declares so
 * explicitly; other portal pages should follow). Static prerender of
 * Clerk-wrapped trees requires a publishable key at build time, which
 * we deliberately avoid coupling here.
 */
export const dynamic = "force-dynamic";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={publicEnv.clerkPublishableKey || undefined}
      signInUrl={publicEnv.signInUrl}
      signUpUrl={publicEnv.signUpUrl}
      signInFallbackRedirectUrl={publicEnv.afterSignInUrl}
      signUpFallbackRedirectUrl={publicEnv.afterSignUpUrl}
    >
      <div className="min-h-screen">
        <header className="border-b border-equipment-700 bg-equipment-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <p className="font-semibold">
              <a
                href="/portal"
                className="text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                fixmyiron
              </a>{" "}
              portal
            </p>
            <nav className="flex items-center gap-4 text-sm text-zinc-300">
              <a href="/portal/parts" className="hover:text-zinc-100">
                Parts
              </a>
              <a
                href="https://accounts.fixmyiron.com/user"
                className="hover:text-zinc-100"
              >
                Account
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </ClerkProvider>
  );
}
