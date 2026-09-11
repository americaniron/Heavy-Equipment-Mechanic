/**
 * Stripe webhook signature verification.
 * Header: Stripe-Signature: t=<unix>;v1=<hex>
 * Signed payload: `${t}.${rawBody}` HMAC-SHA256 with the endpoint secret.
 * Reject timestamps older than 5 minutes (replay).
 */

const MAX_AGE_SECONDS = 300;
const encoder = new TextEncoder();

function utf8(s: string): Uint8Array<ArrayBuffer> {
  const src = encoder.encode(s);
  const buf = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(buf);
  out.set(src);
  return out;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function parseStripeSignature(header: string): { ts: number; v1: string[] } | null {
  let ts: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") {
      const n = Number(v);
      if (Number.isFinite(n)) ts = n;
    } else if (k === "v1") {
      v1.push(v);
    }
  }
  if (ts === null || v1.length === 0) return null;
  return { ts, v1 };
}

export type StripeVerifyResult =
  | { ok: true; rawBody: string; timestamp: number }
  | {
      ok: false;
      reason:
        | "missing_header"
        | "malformed_header"
        | "missing_secret"
        | "stale_timestamp"
        | "bad_signature";
    };

export async function verifyStripeWebhook(
  header: string | null,
  rawBody: string,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StripeVerifyResult> {
  if (!header) return { ok: false, reason: "missing_header" };
  if (!secret) return { ok: false, reason: "missing_secret" };
  const parsed = parseStripeSignature(header);
  if (!parsed) return { ok: false, reason: "malformed_header" };
  if (Math.abs(nowSeconds - parsed.ts) > MAX_AGE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, utf8(`${parsed.ts}.${rawBody}`));
  const computed = new Uint8Array(mac);
  let matched = false;
  for (const hex of parsed.v1) {
    const expected = hexToBytes(hex);
    if (!expected || expected.byteLength !== computed.byteLength) continue;
    let diff = 0;
    for (let i = 0; i < computed.byteLength; i++) diff |= computed[i]! ^ expected[i]!;
    if (diff === 0) matched = true;
  }
  if (!matched) return { ok: false, reason: "bad_signature" };
  return { ok: true, rawBody, timestamp: parsed.ts };
}

export function parseStripeEvent(rawBody: string): {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
} | null {
  try {
    const parsed = JSON.parse(rawBody) as {
      id?: unknown;
      type?: unknown;
      data?: { object?: Record<string, unknown> };
    };
    if (typeof parsed.id !== "string" || typeof parsed.type !== "string") return null;
    if (!parsed.data?.object || typeof parsed.data.object !== "object") return null;
    return {
      id: parsed.id,
      type: parsed.type,
      data: { object: parsed.data.object },
    };
  } catch {
    return null;
  }
}
