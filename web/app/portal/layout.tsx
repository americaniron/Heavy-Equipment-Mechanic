import AuthCheck from "./auth-check";

/**
 * Auth-gated portal shell.
 *
 * Uses local auth (no Clerk). AuthCheck verifies local session token.
 */
export const dynamic = "force-dynamic";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthCheck>
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
                href="#"
                className="hover:text-zinc-100"
              >
                Account
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </AuthCheck>
  );
}
