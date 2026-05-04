import { RepairPlanClient } from "@/components/repair-plan/repair-plan-client";

/**
 * /portal/repair-plan — auto-generated from an active diagnosis session.
 * Free for any signed-in user.
 */
export const dynamic = "force-dynamic";

export default async function RepairPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;
  return <RepairPlanClient initialSessionId={sp.session ?? null} />;
}
