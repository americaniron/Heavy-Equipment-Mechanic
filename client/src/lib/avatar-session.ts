import { ApiError } from "./api";

export type AvatarStartToast = { title: string; description: string };

/** HTTP status from apiRequest / ApiError (not from parsing error.message). */
export function avatarHttpStatus(err: unknown): number {
  if (err instanceof ApiError) return err.status;
  const raw = String(err instanceof Error ? err.message : err);
  const match = raw.match(/^\s*(\d{3})\b/);
  return match ? Number(match[1]) : 0;
}

export function avatarStartFailureToast(status: number): AvatarStartToast {
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

export type AvatarSessionPayload = {
  sessionId?: string;
  sessionToken?: string;
  livekitUrl?: string;
  livekitClientToken?: string;
};

export function assertAvatarSessionPayload(data: AvatarSessionPayload): void {
  if (!data.sessionToken || !data.livekitUrl || !data.livekitClientToken) {
    throw new Error("LiveAvatar did not return LiveKit connection details");
  }
}
