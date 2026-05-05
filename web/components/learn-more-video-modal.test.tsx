import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { LearnMoreVideoModal } from "./learn-more-video-modal";

// happy-dom doesn't implement HTMLDialogElement.{showModal,close}; polyfill
// just enough for our component to drive the imperative dialog API.
beforeAll(() => {
  // Define show/close methods on the prototype so every <dialog> in the
  // test gets them.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
      // happy-dom doesn't auto-set this.open to true on attribute set
      Object.defineProperty(this, "open", {
        configurable: true,
        get: () => this.hasAttribute("open"),
      });
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
  // jsdom/happy-dom HTMLMediaElement methods are no-ops; spy-friendly.
  HTMLMediaElement.prototype.pause = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("LearnMoreVideoModal", () => {
  const SRC = "https://example.test/learn.mp4";

  it("does not call showModal when open=false on first mount", () => {
    const showSpy = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<LearnMoreVideoModal open={false} onClose={() => {}} videoSrc={SRC} />);
    expect(showSpy).not.toHaveBeenCalled();
  });

  it("opens the dialog and renders the <video> when open=true", () => {
    const showSpy = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<LearnMoreVideoModal open={true} onClose={() => {}} videoSrc={SRC} />);
    expect(showSpy).toHaveBeenCalled();
    const video = screen.getByLabelText("fixmyiron product overview");
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("src")).toBe(SRC);
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(false);
    expect(video.hasAttribute("autoplay")).toBe(false);
  });

  it("calls pause + resets currentTime to 0 when toggled to closed", () => {
    const pauseSpy = vi.fn();
    HTMLMediaElement.prototype.pause = pauseSpy;
    const { rerender } = render(
      <LearnMoreVideoModal open={true} onClose={() => {}} videoSrc={SRC} />,
    );
    const video = screen.getByLabelText("fixmyiron product overview") as HTMLVideoElement;
    // Simulate user having played to 30s.
    video.currentTime = 30;
    rerender(<LearnMoreVideoModal open={false} onClose={() => {}} videoSrc={SRC} />);
    expect(pauseSpy).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<LearnMoreVideoModal open={true} onClose={onClose} videoSrc={SRC} />);
    fireEvent.click(screen.getByRole("button", { name: /close video/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the native dialog 'close' event fires (ESC path)", () => {
    const onClose = vi.fn();
    render(<LearnMoreVideoModal open={true} onClose={onClose} videoSrc={SRC} />);
    const dialog = screen.getByRole("dialog");
    // Simulate ESC: native dialog dispatches a 'close' event.
    fireEvent(dialog, new Event("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders captions <track> only when vttSrc is provided", () => {
    const { rerender } = render(
      <LearnMoreVideoModal open={true} onClose={() => {}} videoSrc={SRC} />,
    );
    expect(document.querySelector("track")).toBeNull();
    rerender(
      <LearnMoreVideoModal
        open={true}
        onClose={() => {}}
        videoSrc={SRC}
        vttSrc="https://example.test/learn.vtt"
      />,
    );
    const track = document.querySelector("track");
    expect(track).not.toBeNull();
    expect(track?.getAttribute("kind")).toBe("captions");
    expect(track?.getAttribute("src")).toBe("https://example.test/learn.vtt");
  });

  it("aria-label is on the dialog, default value matches spec", () => {
    render(<LearnMoreVideoModal open={true} onClose={() => {}} videoSrc={SRC} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Learn more about fixmyiron");
  });
});
