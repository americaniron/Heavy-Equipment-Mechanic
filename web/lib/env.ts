/**
 * Public env exposed to the browser. Throws at startup if required values are
 * missing so misconfiguration fails loud, not silent.
 */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const publicEnv = {
  clerkPublishableKey: required(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ),
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  paddleClientToken:
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
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
} as const;
