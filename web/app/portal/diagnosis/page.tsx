import { DiagnosisClient } from "@/components/diagnosis/diagnosis-client";

/**
 * /portal/diagnosis — AI Mechanic diagnosis engine.
 * Free tier: chat mode, 3/month. Pro/Shop: scenario engine + chat,
 * unlimited (gating enforced server-side via D1 subscriptions; for the
 * pre-Paddle window all users default to free until manual D1 upgrade).
 */
export const dynamic = "force-dynamic";

export default function DiagnosisPage() {
  return <DiagnosisClient />;
}
