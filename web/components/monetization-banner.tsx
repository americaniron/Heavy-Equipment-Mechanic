/**
 * Monetization banner shown on every public marketing page outside /portal.
 * Required by punch-list item #3.
 */
export function MonetizationBanner() {
  return (
    <div
      role="status"
      aria-label="Pricing notice"
      className="w-full border-b border-equipment-700 bg-equipment-900 text-zinc-100"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-sm">
        <p>
          <span className="font-semibold text-accent">Sign up FREE</span>
          <span className="ml-2 text-zinc-300">
            — basic diagnostics included free with signup. The full diagnostic
            engine and premium tools require a paid plan.
          </span>
        </p>
        <a
          href="/pricing"
          className="hidden whitespace-nowrap rounded-md bg-accent px-3 py-1 font-medium text-accent-fg hover:bg-accent-hover sm:inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          See pricing
        </a>
      </div>
    </div>
  );
}
