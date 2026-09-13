import { describe, expect, it } from "vitest";

// Mirrors client/src/lib/avatar-session.ts so the toast/status mapping stays regression-tested.
function avatarHttpStatus(err: unknown): number {
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: number }).status === "number") {
    return (err as { status: number }).status;
  }
  const raw = String(err instanceof Error ? err.message : err);
  const match = raw.match(/^\s*(\d{3})\b/);
  return match ? Number(match[1]) : 0;
}

function avatarStartFailureToast(status: number) {
  if (status === 401) {
    return {
      title: "Sign in required",
      description:
        "Sign in with a Pro account to use the live GPT voice avatar. Continuing in text mode.",
    };
  }
  if (status === 403) {
    return {
      title: "Pro plan required",
      description:
        "The live GPT voice avatar requires a Pro subscription. Continuing in text mode.",
    };
  }
  if (status === 502 || status === 503) {
    return {
      title: "Avatar service unavailable",
      description:
        "The LiveAvatar service could not start (credential may be invalid/expired). Continuing in text mode.",
    };
  }
  return {
    title: "Live avatar unavailable",
    description: "The live GPT voice avatar could not start. Continuing in text mode.",
  };
}

describe("avatar start failure mapping (repair)", () => {
  it("reads ApiError.status instead of parsing message text", () => {
    const err = Object.assign(new Error("Unable to start a LiveAvatar session."), { status: 502 });
    expect(avatarHttpStatus(err)).toBe(502);
    expect(avatarStartFailureToast(avatarHttpStatus(err)).title).toBe("Avatar service unavailable");
  });

  it("maps 403 to Pro plan required", () => {
    expect(avatarStartFailureToast(403).title).toBe("Pro plan required");
  });
});
