/**
 * Public env exposed to the browser.
 *
 * Required keys (publishable Clerk key, API URL) emit a console.warn when
 * missing — they are enforced at runtime by the consuming code (Clerk's
 * provider will refuse to mount; API calls will fail). We deliberately
 * don't throw at import time so a misconfigured deploy can still serve
 * static pages and surface a clean error rather than a 500 on every route.
 */
function expected(name: string, value: string | undefined): string {
  if (!value && typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.warn(`[env] missing ${name}`);
  }
  return value ?? "";
}

export const publicEnv = {
  clerkPublishableKey: expected(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ),
  apiUrl: expected("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  paddleClientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
  paddleEnvironment: (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT ?? "sandbox") as
    | "sandbox"
    | "production",
  signInUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ??
    "https://accounts.fixmyiron.com/sign-in",
  signUpUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ??
    "https://accounts.fixmyiron.com/sign-up",
  afterSignInUrl: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? "/portal",
  afterSignUpUrl: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ?? "/portal",
  learnMoreVideoUrl: process.env.NEXT_PUBLIC_LEARN_MORE_VIDEO_URL ?? "",
} as const;
