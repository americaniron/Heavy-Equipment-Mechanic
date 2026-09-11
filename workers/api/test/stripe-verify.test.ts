import { describe, expect, it } from "vitest";
import { parseStripeEvent, verifyStripeWebhook } from "../src/lib/stripe-verify";

async function sign(secret: string, payload: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v1=${hex}`;
}

describe("verifyStripeWebhook", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active", customer: "cus_1" } },
  });

  it("accepts a valid signature", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await sign(secret, payload, ts);
    const result = await verifyStripeWebhook(header, payload, secret, ts);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing header", async () => {
    const result = await verifyStripeWebhook(null, payload, secret);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_header");
  });

  it("rejects a bad signature", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const result = await verifyStripeWebhook(`t=${ts},v1=${"ab".repeat(32)}`, payload, secret, ts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects a stale timestamp", async () => {
    const ts = Math.floor(Date.now() / 1000) - 10_000;
    const header = await sign(secret, payload, ts);
    const result = await verifyStripeWebhook(header, payload, secret, Math.floor(Date.now() / 1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale_timestamp");
  });
});

describe("parseStripeEvent", () => {
  it("parses a subscription event", () => {
    const event = parseStripeEvent(
      JSON.stringify({
        id: "evt_1",
        type: "invoice.paid",
        data: { object: { id: "in_1", customer: "cus_1" } },
      }),
    );
    expect(event?.id).toBe("evt_1");
    expect(event?.type).toBe("invoice.paid");
  });

  it("returns null for junk", () => {
    expect(parseStripeEvent("{")).toBeNull();
    expect(parseStripeEvent(JSON.stringify({ hello: true }))).toBeNull();
  });
});
