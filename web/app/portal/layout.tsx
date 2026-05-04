/**
 * Auth-gated portal shell.
 * Authentication enforcement lives in middleware.ts (Clerk). This layout
 * only renders the chrome; if the user is unauthenticated they will have
 * already been redirected by middleware before reaching this component.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-equipment-700 bg-equipment-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <p className="font-semibold">
            <span className="text-accent">fixmyiron</span> portal
          </p>
          <nav className="text-sm text-zinc-300">
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
  );
}
