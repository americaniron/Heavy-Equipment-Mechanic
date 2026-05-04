import { describe, expect, it } from "vitest";
import { verifyPaddleWebhook, signForTest } from "../src/lib/paddle-verify";

const SECRET = "pdl_ntfset_01abc_TEST_SECRET";
const SAMPLE_BODY = JSON.stringify({
  event_id: "evt_01h12345",
  event_type: "subscription.created",
  occurred_at: "2026-05-03T22:00:00.000Z",
  data: { id: "sub_01abc", customer_id: "ctm_01xyz", status: "active" },
});

describe("verifyPaddleWebhook", () => {
  it("accepts a fresh, correctly-signed body", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await signForTest(SECRET, SAMPLE_BODY, ts);
    const r = await verifyPaddleWebhook({
      signatureHeader: header,
      rawBody: SAMPLE_BODY,
      secret: SECRET,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a tampered body (signature mismatch)", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await signForTest(SECRET, SAMPLE_BODY, ts);
    const tampered = SAMPLE_BODY.replace('"active"', '"canceled"');
    const r = await verifyPaddleWebhook({
      signatureHeader: header,
      rawBody: tampered,
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("rejects when the secret differs", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await signForTest(SECRET, SAMPLE_BODY, ts);
    const r = await verifyPaddleWebhook({
      signatureHeader: header,
      rawBody: SAMPLE_BODY,
      secret: "WRONG_SECRET",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("rejects a stale timestamp (replay window)", async () => {
    const old = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes ago
    const header = await signForTest(SECRET, SAMPLE_BODY, old);
    const r = await verifyPaddleWebhook({
      signatureHeader: header,
      rawBody: SAMPLE_BODY,
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("stale_timestamp");
  });

  it("rejects missing header", async () => {
    const r = await verifyPaddleWebhook({
      signatureHeader: null,
      rawBody: SAMPLE_BODY,
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_header");
  });

  it("rejects malformed header", async () => {
    const r = await verifyPaddleWebhook({
      signatureHeader: "not_a_real_header",
      rawBody: SAMPLE_BODY,
      secret: SECRET,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed_header");
  });

  it("rejects when secret is empty", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = await signForTest(SECRET, SAMPLE_BODY, ts);
    const r = await verifyPaddleWebhook({
      signatureHeader: header,
      rawBody: SAMPLE_BODY,
      secret: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_secret");
  });
});
