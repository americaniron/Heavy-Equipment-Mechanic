import { z } from "zod";

export const RecommendationCard = z.object({
  part_number: z.string().min(1),
  name: z.string().min(1),
  image_placeholder_url: z.string().min(1),
  why_you_need_it: z.string().min(1),
  price_usd: z.number().nullable(),
  cta_label: z.string().min(1).default("Add to Inquiry"),
});
export type RecommendationCard = z.infer<typeof RecommendationCard>;

export const BundleOffer = z.object({
  label: z.string().min(1),
  part_numbers: z.array(z.string().min(1)).min(2),
  bundle_savings_usd: z.number().min(0),
  rationale: z.string().min(1),
});
export type BundleOffer = z.infer<typeof BundleOffer>;

export const RecommendationsOutput = z.object({
  hero_line: z.string().min(1),
  cards: z.array(RecommendationCard).min(2).max(8),
  bundle_offer: BundleOffer.nullable().default(null),
  urgency_framing: z.string().min(1),
});
export type RecommendationsOutput = z.infer<typeof RecommendationsOutput>;

/** Caller may pass either a session id (server pulls context) or an
 *  ad-hoc set of part numbers (cart-style). At least one is required. */
export const RecommendInput = z
  .object({
    session_id: z.string().uuid().optional(),
    cart_part_numbers: z.array(z.string().min(1).max(40)).max(50).default([]),
  })
  .refine(
    (v) => Boolean(v.session_id) || v.cart_part_numbers.length > 0,
    { message: "Provide session_id or cart_part_numbers" },
  );
export type RecommendInput = z.infer<typeof RecommendInput>;
