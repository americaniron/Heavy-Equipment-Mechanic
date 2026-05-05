"use client";

import { useEffect, useRef, MouseEvent } from "react";

/**
 * Learn-More marketing video modal.
 *
 * Implementation notes:
 * - Uses the native <dialog> element rather than @radix-ui/react-dialog
 *   (or shadcn/ui Dialog). Native <dialog>.showModal() gives us focus
 *   trap, ESC-to-close, focus return on close, and the ::backdrop
 *   pseudo-element for free — no extra dependency.
 * - The video uses preload="metadata" so the 75 MB file isn't pulled
 *   over the wire until the user actually presses play. Source URL is
 *   served from R2 via the public r2.dev managed subdomain (set in
 *   wrangler.jsonc as NEXT_PUBLIC_LEARN_MORE_VIDEO_URL).
 * - Captions: the source MP4 has an mov_text subtitle track but the
 *   build host has no ffmpeg, so we couldn't extract WebVTT. The
 *   `vttSrc` prop is wired through; pass it once a .vtt is uploaded
 *   alongside the .mp4 in R2. Documented in DEPLOY_NOTES.md.
 * - On close: pause + reset currentTime to 0 so reopening starts from
 *   the beginning, not from the user's last position.
 */
export interface LearnMoreVideoModalProps {
  open: boolean;
  onClose: () => void;
  videoSrc: string;
  /** Optional WebVTT captions URL. */
  vttSrc?: string;
  /** Override aria-label for the dialog. */
  label?: string;
}

export function LearnMoreVideoModal({
  open,
  onClose,
  videoSrc,
  vttSrc,
  label = "Learn more about fixmyiron",
}: LearnMoreVideoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync the React `open` prop to the imperative <dialog> API.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Pause + reset on close. Runs whenever `open` flips to false.
  useEffect(() => {
    if (!open && videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // pause() rejects on rare browser races; ignore.
      }
      videoRef.current.currentTime = 0;
    }
  }, [open]);

  // Backdrop click closes (clicks on the dialog element itself, not
  // the inner content, target the backdrop).
  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  // Native <dialog> ESC fires a `cancel` event, then `close`. We listen
  // to `close` so the React state stays in sync regardless of how the
  // dialog was dismissed (ESC, close button, programmatic).
  function handleNativeClose() {
    if (open) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      aria-label={label}
      className="
        m-0 max-h-[100dvh] max-w-[100vw] w-full p-0
        bg-transparent
        backdrop:bg-equipment-950/80 backdrop:backdrop-blur-sm
      "
    >
      <div
        className="
          mx-auto flex min-h-[100dvh] w-full items-center justify-center
          p-4 sm:p-8
        "
      >
        <div
          className="
            relative w-full max-w-4xl overflow-hidden rounded-lg
            border border-equipment-700 bg-equipment-950 shadow-2xl
          "
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video"
            className="
              absolute right-2 top-2 z-10 rounded-md bg-equipment-900/80
              p-2 text-zinc-200 hover:bg-equipment-800 hover:text-zinc-50
              focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
              min-h-[44px] min-w-[44px] flex items-center justify-center
            "
          >
            <span aria-hidden className="text-lg leading-none">✕</span>
          </button>
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            controlsList="nodownload"
            preload="metadata"
            playsInline
            loop={false}
            aria-label="fixmyiron product overview"
            className="block aspect-video w-full bg-black"
          >
            {vttSrc && (
              <track
                kind="captions"
                srcLang="en"
                src={vttSrc}
                label="English"
                default
              />
            )}
          </video>
        </div>
      </div>
    </dialog>
  );
}
