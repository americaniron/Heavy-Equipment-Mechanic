import { TroubleshootingClient } from "@/components/troubleshooting/troubleshooting-client";

/**
 * /portal/troubleshooting — guided wizard. Same Anthropic client and
 * tier-gating as /portal/diagnosis. Counts toward the monthly diagnosis
 * quota for free-tier users (one new wizard = one diagnosis).
 */
export const dynamic = "force-dynamic";

export default function TroubleshootingPage() {
  return <TroubleshootingClient />;
}
