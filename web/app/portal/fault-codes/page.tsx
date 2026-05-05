import { FaultCodesClient } from "@/components/fault-codes/fault-codes-client";

/**
 * /portal/fault-codes — search/lookup. SAE J1939 codes + curated CAT
 * codes. Free tier sees code + description; paid sees causes + repair
 * actions + related parts. Currently feature-flagged so all signed-in
 * users see the paid view (Paddle deferred).
 */
export const dynamic = "force-dynamic";

export default function FaultCodesPage() {
  return <FaultCodesClient />;
}
