import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";

/**
 * Sign-in entry — bounces to Clerk's hosted Account Portal at
 * accounts.fixmyiron.com per spec. Clerk handles the form, then
 * redirects back to /portal (NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL).
 *
 * We use the catch-all [[...sign-in]] route so any deep links Clerk
 * may use (e.g. /sign-in/factor-one) also redirect cleanly.
 */
export default function SignInPage() {
  redirect(publicEnv.signInUrl);
}
