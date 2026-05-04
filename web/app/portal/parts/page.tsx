import { PartsClient } from "@/components/parts/parts-client";

/**
 * /portal/parts — search the unified parts catalog (CAT XLS + Costex PDF
 * sources). Auth is enforced by the global Clerk middleware (matcher
 * includes /portal/*); this page assumes a signed-in user.
 *
 * Dynamic rendering: the page hits the API per-request via Clerk session
 * tokens, so prerendering provides no value and would couple the build
 * to the publishable key.
 */
export const dynamic = "force-dynamic";

export default function PartsPage() {
  return <PartsClient />;
}
