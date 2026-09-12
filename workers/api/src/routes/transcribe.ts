import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { getCustomerByAuthToken, selectOne } from "../lib/d1-helpers";
import { checkAndIncrement, WINDOW_MINUTE_MS } from "../lib/ratelimit";

export const transcribeRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * OpenAI file-transcription model for POST /v1/audio/transcriptions.
 *
 * `whisper-1` was deprecated on 2026-08-26 and shuts down 2027-02-26; the
 * vendor's recommended replacement for uploaded/completed audio is
 * `gpt-transcribe`, a documented drop-in on the same endpoint with
 * `response_format=json` returning `{ text }`.
 * Refs: https://developers.openai.com/api/docs/deprecations
 *       https://developers.openai.com/cookbook/examples/migrating_from_whisper_to_gpt_transcribe
 * Overridable at runtime via the OPENAI_TRANSCRIBE_MODEL env var (optional).
 */
export const OPENAI_TRANSCRIBE_MODEL = "gpt-transcribe";

function transcribeModel(env: { OPENAI_TRANSCRIBE_MODEL?: string }): string {
  const override = env.OPENAI_TRANSCRIBE_MODEL;
  return override && override.trim() ? override.trim() : OPENAI_TRANSCRIBE_MODEL;
}

function tokenFrom(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const legacy = c.req.header("x-auth-token");
  if (legacy) return legacy;
  const auth = c.req.header("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * Speech-to-text for the *text-only* diagnosis fallback.
 * LiveAvatar + OpenAI Realtime owns the microphone when an avatar session is live;
 * this route is used only when that connector is unavailable.
 */
transcribeRoutes.post("/", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const sessionToken = c.req.header("x-session-token");
  let allowed = Boolean(customer);
  if (!allowed && sessionToken) {
    const session = await selectOne(
      c.env.DB,
      "SELECT id FROM sessions WHERE access_token = ?1 LIMIT 1",
      sessionToken,
    );
    allowed = Boolean(session);
  }
  if (!allowed) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Sign in or a live session token is required");
  }

  if (!c.env.OPENAI_API_KEY) {
    return jsonError(
      c,
      503,
      ErrorCode.Upstream,
      "Speech transcription is not configured.",
      "OPENAI_API_KEY must be set on the API Worker.",
    );
  }

  const ip = c.req.header("cf-connecting-ip") || "anon";
  const rl = await checkAndIncrement({
    env: c.env,
    userId: customer ? `c:${customer.id}` : ip,
    scope: "transcribe",
    max: 20,
    windowMs: WINDOW_MINUTE_MS * 10,
  });
  if (!rl.ok) return jsonError(c, 429, ErrorCode.RateLimited, "Too many transcription requests.");

  const form = await c.req.raw.formData().catch(() => null);
  const audio = form?.get("audio") ?? form?.get("file");
  if (!(audio instanceof File) || audio.size < 1) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Audio file is required");
  }
  if (audio.size > 8 * 1024 * 1024) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Audio file is too large");
  }

  const outbound = new FormData();
  outbound.append("file", audio, audio.name || "recording.webm");
  outbound.append("model", transcribeModel(c.env as { OPENAI_TRANSCRIBE_MODEL?: string }));
  outbound.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${c.env.OPENAI_API_KEY}` },
    body: outbound,
  });
  const json = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!res.ok) {
    return jsonError(c, 502, ErrorCode.Upstream, "Transcription failed. Try typing instead.");
  }
  return c.json({ text: String(json.text ?? "").trim() });
});
