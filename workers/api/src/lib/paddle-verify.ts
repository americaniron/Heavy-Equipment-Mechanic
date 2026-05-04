/**
 * Paddle Billing webhook signature verification (Notification Settings → secret).
 *
 * Header format:
 *   Paddle-Signature: ts=<unix_seconds>;h1=<hex_hmac_sha256>
 *
 * Signed payload:
 *   `${ts}:${raw_request_body}`
 *
 * Algorithm: HMAC-SHA256 with the notification destination's secret. We use
 * crypto.subtle.verify which is constant-time. We also reject any signature
 * older than 5 minutes to mitigate replay.
 */

const MAX_AGE_SECONDS = 300;
const encoder = new TextEncoder();

/**
 * TextEncoder.encode returns Uint8Array<ArrayBufferLike>; Workers' Web Crypto
 * types want a Uint8Array backed by a definite ArrayBuffer. Re-wrap so TS
 * accepts it as BufferSource without an unsafe cast.
 */
function utf8(s: string): Uint8Array<ArrayBuffer> {
  const src = encoder.encode(s);
  const buf = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(buf);
  out.set(src);
  return out;
}

export interface VerifiedPaddleWebhook {
  ok: true;
  rawBody: string;
  timestamp: number;
}
export interface RejectedPaddleWebhook {
  ok: false;
  reason:
    | "missing_header"
    | "malformed_header"
    | "missing_secret"
    | "stale_timestamp"
    | "bad_signature";
}
export type PaddleVerifyResult = VerifiedPaddleWebhook | RejectedPaddleWebhook;

function parseSignatureHeader(
  header: string,
): { ts: number; h1: string } | null {
  // ts=...;h1=...
  let ts: number | null = null;
  let h1: string | null = null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "ts") {
      const n = Number(v);
      if (Number.isFinite(n)) ts = n;
    } else if (k === "h1") {
      h1 = v;
    }
  }
  if (ts === null || h1 === null) return null;
  return { ts, h1 };
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0) return null;
  // Backed by a definite ArrayBuffer (not ArrayBufferLike) so TS 5.7+
  // accepts it as BufferSource for crypto.subtle.verify.
  const buf = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/**
 * Verify a Paddle webhook. Pass the raw body as a string (NOT the parsed
 * JSON — JSON.stringify(JSON.parse(x)) is not bytewise-equal to x and will
 * break HMAC). Returns a discriminated union; caller decides the response.
 *
 * `now` is injectable for tests; defaults to Date.now().
 */
export async function verifyPaddleWebhook(args: {
  signatureHeader: string | null;
  rawBody: string;
  secret: string;
  now?: () => number;
}): Promise<PaddleVerifyResult> {
  const { signatureHeader, rawBody, secret } = args;
  const now = args.now ?? Date.now;

  if (!signatureHeader) return { ok: false, reason: "missing_header" };
  if (!secret) return { ok: false, reason: "missing_secret" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed_header" };

  const ageSeconds = Math.abs(Math.floor(now() / 1000) - parsed.ts);
  if (ageSeconds > MAX_AGE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const sigBytes = hexToBytes(parsed.h1);
  if (!sigBytes) return { ok: false, reason: "bad_signature" };

  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    utf8(`${parsed.ts}:${rawBody}`),
  );
  if (!ok) return { ok: false, reason: "bad_signature" };
  return { ok: true, rawBody, timestamp: parsed.ts };
}

/**
 * Helper to compute a Paddle-style signature for tests. Never used in
 * production — only test fixtures call this.
 */
export async function signForTest(
  secret: string,
  rawBody: string,
  ts: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    utf8(`${ts}:${rawBody}`),
  );
  const hex = Array.from(new Uint8Array(sig), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `ts=${ts};h1=${hex}`;
}
