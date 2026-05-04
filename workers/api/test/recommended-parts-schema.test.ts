import { describe, expect, it } from "vitest";
import {
  RecommendInput,
  RecommendationsOutput,
} from "../src/lib/recommended-parts-schema";

describe("RecommendInput", () => {
  it("accepts session_id alone", () => {
    expect(
      RecommendInput.safeParse({
        session_id: "00000000-0000-4000-8000-000000000000",
      }).success,
    ).toBe(true);
  });
  it("accepts cart_part_numbers alone", () => {
    expect(
      RecommendInput.safeParse({ cart_part_numbers: ["1R-0750", "9V3405"] })
        .success,
    ).toBe(true);
  });
  it("rejects when both are absent", () => {
    expect(RecommendInput.safeParse({}).success).toBe(false);
  });
  it("caps cart at 50", () => {
    expect(
      RecommendInput.safeParse({
        cart_part_numbers: Array(51).fill("X"),
      }).success,
    ).toBe(false);
  });
});

describe("RecommendationsOutput", () => {
  const minimal = {
    hero_line: "Get your CAT 350G back digging by tomorrow with these three pump-side parts.",
    cards: [
      {
        part_number: "1R-0750",
        name: "Hydraulic suction screen",
        image_placeholder_url: "/img/parts/placeholder.svg",
        why_you_need_it: "Mud pulled into your suction screen is the first thing to confirm before any pump rebuild — this is the cheap fix.",
        price_usd: 42.5,
        cta_label: "Add to Inquiry",
      },
      {
        part_number: "9V3405",
        name: "Pump GP-bucket",
        image_placeholder_url: "/img/parts/placeholder.svg",
        why_you_need_it: "If the screen is clean, this rebuilt pump unit is the next-up swap.",
        price_usd: 1450,
        cta_label: "Add to Inquiry",
      },
    ],
    bundle_offer: null,
    urgency_framing: "Sidelined for a week, you're looking at $7,500–$15,000 in lost revenue on a paving job.",
  };

  it("accepts a minimal valid output", () => {
    expect(RecommendationsOutput.safeParse(minimal).success).toBe(true);
  });

  it("rejects fewer than 2 cards", () => {
    expect(
      RecommendationsOutput.safeParse({
        ...minimal,
        cards: [minimal.cards[0]!],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 8 cards", () => {
    expect(
      RecommendationsOutput.safeParse({
        ...minimal,
        cards: Array(9).fill(minimal.cards[0]!),
      }).success,
    ).toBe(false);
  });

  it("requires hero_line non-empty", () => {
    expect(
      RecommendationsOutput.safeParse({ ...minimal, hero_line: "" }).success,
    ).toBe(false);
  });

  it("permits null price_usd", () => {
    expect(
      RecommendationsOutput.safeParse({
        ...minimal,
        cards: [{ ...minimal.cards[0]!, price_usd: null }, minimal.cards[1]!],
      }).success,
    ).toBe(true);
  });

  it("validates a bundle offer when present", () => {
    expect(
      RecommendationsOutput.safeParse({
        ...minimal,
        bundle_offer: {
          label: "Pump-side overhaul kit",
          part_numbers: ["1R-0750", "9V3405"],
          bundle_savings_usd: 120,
          rationale: "Replace the screen at the same time you swap the pump and you save the second teardown.",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects bundle with single PN (must be ≥2)", () => {
    expect(
      RecommendationsOutput.safeParse({
        ...minimal,
        bundle_offer: {
          label: "x",
          part_numbers: ["1R-0750"],
          bundle_savings_usd: 0,
          rationale: "x",
        },
      }).success,
    ).toBe(false);
  });
});
