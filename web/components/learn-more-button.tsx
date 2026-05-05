"use client";

import { useState } from "react";
import { LearnMoreVideoModal } from "./learn-more-video-modal";

/**
 * "Learn more" CTA + video modal pair. The button receives focus back
 * automatically on dialog close (native <dialog> behavior).
 */
export function LearnMoreButton({ videoSrc }: { videoSrc: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!videoSrc}
        className="rounded-md border border-equipment-600 px-5 py-3 font-semibold text-zinc-100 hover:bg-equipment-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Learn more
      </button>
      {videoSrc && (
        <LearnMoreVideoModal
          open={open}
          onClose={() => setOpen(false)}
          videoSrc={videoSrc}
        />
      )}
    </>
  );
}
