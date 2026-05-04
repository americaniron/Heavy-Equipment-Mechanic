import { RecommendedPartsClient } from "@/components/recommended-parts/recommended-parts-client";

/**
 * /portal/recommended-parts — sales-tone recommendations for a
 * diagnosis session or an ad-hoc cart. Free for any signed-in user.
 *
 * Accepts optional ?session=<uuid> from /portal/diagnosis CTA.
 */
export const dynamic = "force-dynamic";

export default async function RecommendedPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sp = await searchParams;
  return <RecommendedPartsClient initialSessionId={sp.session ?? null} />;
}
