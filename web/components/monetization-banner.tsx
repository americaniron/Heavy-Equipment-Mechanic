"use client";

import { useEffect, useState } from "react";

/**
 * Sticky, dismissible monetization banner shown on every public page
 * outside /portal. Required by punch-list item #3.
 *
 * Dismissal is persisted in localStorage so a returning visitor doesn't
 * see the banner again on the same browser. The dismissal key includes
 * a content-version suffix so we can re-show the banner when the
 * messaging changes (bump CONTENT_VERSION).
 */
const CONTENT_VERSION = "2026-05";
const STORAGE_KEY = `fmi.banner.dismissed.v${CONTENT_VERSION}`;

export function MonetizationBanner() {
  // Default to NOT visible during SSR so the markup doesn't flash on
  // hydration if the user has dismissed it previously. We flip to true
  // in the effect once we've checked localStorage.
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "1") {
        setVisible(true);
      }
    } catch {
      // localStorage not available (e.g., privacy mode) — show by default.
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Best-effort; if storage fails the banner just reappears next visit.
    }
  }

  if (!hydrated || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Pricing notice"
      className="sticky top-0 z-50 w-full border-b border-equipment-700 bg-equipment-900/95 backdrop-blur-sm text-zinc-100"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <p className="min-w-0">
          <span className="font-semibold text-accent">Sign up FREE</span>
          <span className="ml-2 text-zinc-300">
            — basic diagnostics are included free with signup. The full
            diagnostic engine and premium tools require a paid plan.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/pricing"
            className="hidden whitespace-nowrap rounded-md bg-accent px-3 py-1 font-medium text-accent-fg hover:bg-accent-hover sm:inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            See pricing
          </a>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss pricing notice"
            className="rounded-md p-1 text-zinc-500 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      </div>
    </div>
  );
}
