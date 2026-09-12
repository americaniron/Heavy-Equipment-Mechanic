import { describe, expect, it } from "vitest";
import { mapStripeStatus, tierForStripePrice } from "../src/lib/stripe-billing";
import type { Env } from "../src/env";

describe("mapStripeStatus", () => {
  it("maps Stripe statuses onto app subscription states", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("incomplete")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
  });
});

describe("tierForStripePrice", () => {
  const env = {
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_SHOP: "price_shop",
  } as Env;

  it("never grants a paid tier from an unknown price id", () => {
    expect(tierForStripePrice(env, "price_unknown")).toBe("free");
    expect(tierForStripePrice(env, undefined)).toBe("free");
    expect(tierForStripePrice(env, "price_pro")).toBe("pro");
    expect(tierForStripePrice(env, "price_shop")).toBe("shop");
  });
});
