import type { Env } from "../env";
import { log } from "./log";

const LIVEAVATAR_API = "https://api.liveavatar.com";
const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

/**
 * OpenAI Realtime model used inside LiveAvatar's `openai_realtime_config`.
 *
 * `gpt-realtime` was deprecated on 2026-07-20 and shuts down 2027-01-20; the
 * vendor's recommended replacement is the GA model `gpt-realtime-2.1`.
 * Ref: https://developers.openai.com/api/docs/deprecations
 * Overridable at runtime via the OPENAI_REALTIME_MODEL env var (optional).
 */
export const OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";

function realtimeModel(env: Env): string {
  const override = (env as { OPENAI_REALTIME_MODEL?: string }).OPENAI_REALTIME_MODEL;
  return override && override.trim() ? override.trim() : OPENAI_REALTIME_MODEL;
}

type AvatarConfig = {
  avatarId: string;
  name: string;
  contextId: string;
};

const AVATAR_MAP_EN: Record<string, AvatarConfig> = {
  admin: {
    avatarId: "073b60a9-89a8-45aa-8902-c358f64d2852",
    name: "Sarah",
    contextId: "d6ee6151-e0a0-4c3a-a598-241853641e37",
  },
  heavy_equipment: {
    avatarId: "38ad67ed-98f0-407c-a2d2-4f0998b306fc",
    name: "Mike",
    contextId: "696008fe-4f45-4c86-a18f-11636b246c09",
  },
  power_gen: {
    avatarId: "0aae6046-0ab9-44fe-a08d-c5ac3f406d34",
    name: "Sarah C.",
    contextId: "b9c79e29-9184-4a8a-a3c3-9b848267976e",
  },
  marine: {
    avatarId: "200eba85-74c0-4210-8670-81ceab4efd0d",
    name: "James",
    contextId: "46e8c762-c0c5-4770-af10-a2232373cad2",
  },
  hydraulics: {
    avatarId: "246e8d9d-5826-4f49-b8a0-07cb73ff7556",
    name: "David",
    contextId: "ba83f0c7-badc-4657-9803-b3f2a3801787",
  },
  electrical: {
    avatarId: "ebdfdc7e-7e2c-4d2c-8407-a78883e5000a",
    name: "Elena",
    contextId: "a8b7be49-abe6-4760-820a-bcdffcf49706",
  },
  parts: {
    avatarId: "03f8332d-9046-42a1-bff3-3b2309f77b58",
    name: "Marcus",
    contextId: "c684a5d2-49e6-4647-a8db-f3af5a84e2ce",
  },
};

export function liveAvatarApiKey(env: Env): string | undefined {
  return env.LIVEAVATAR_API_KEY || env.HEYGEN_API_KEY;
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    "x-api-key": apiKey,
  };
}

async function liveAvatarFetch(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${LIVEAVATAR_API}${path}`, {
    ...init,
    headers: { ...jsonHeaders(apiKey), ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, text };
}

export async function ensureOpenAiSecretId(env: Env): Promise<string> {
  if (env.LIVEAVATAR_OPENAI_SECRET_ID) return env.LIVEAVATAR_OPENAI_SECRET_ID;
  const cached = await env.SESSIONS.get("liveavatar:openai_secret_id");
  if (cached) return cached;
  const apiKey = liveAvatarApiKey(env);
  if (!apiKey) throw new Error("LIVEAVATAR_API_KEY_MISSING");
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_MISSING");

  const created = await liveAvatarFetch(apiKey, "/v1/secrets", {
    method: "POST",
    body: JSON.stringify({
      secret_type: "OPENAI_API_KEY",
      secret_value: env.OPENAI_API_KEY,
      secret_name: "FixMyIron OpenAI Realtime",
    }),
  });
  const data = (created.json.data ?? created.json) as Record<string, unknown>;
  const secretId =
    (typeof data.id === "string" && data.id) ||
    (typeof data.secret_id === "string" && data.secret_id) ||
    null;
  if (!created.ok || !secretId) {
    log.error("liveavatar_secret_create_failed", { status: created.status });
    throw new Error("LIVEAVATAR_OPENAI_SECRET_CREATE_FAILED");
  }
  await env.SESSIONS.put("liveavatar:openai_secret_id", secretId);
  return secretId;
}

export async function createLiteOpenAiSession(
  env: Env,
  args: { agentType?: string; language?: string; sandbox?: boolean },
): Promise<{
  sessionId: string;
  sessionToken: string;
  livekitUrl: string;
  livekitClientToken: string;
  mode: "LITE";
  provider: "liveavatar-openai";
  sandbox: boolean;
  avatarName: string;
}> {
  const apiKey = liveAvatarApiKey(env);
  if (!apiKey) throw new Error("LIVEAVATAR_API_KEY_MISSING");

  const sandbox =
    args.sandbox === true ||
    env.LIVEAVATAR_SANDBOX === "true" ||
    env.APP_ENV !== "production";
  const agentType = args.agentType || "admin";
  const avatar = AVATAR_MAP_EN[agentType] ?? AVATAR_MAP_EN.admin!;
  const avatarId = sandbox ? SANDBOX_AVATAR_ID : avatar.avatarId;
  const secretId = await ensureOpenAiSecretId(env);

  const tokenBody = {
    mode: "LITE",
    avatar_id: avatarId,
    is_sandbox: sandbox,
    video_settings: { quality: "high", encoding: "H264" },
    openai_realtime_config: {
      secret_id: secretId,
      context_id: avatar.contextId,
      voice: "cedar",
      model: realtimeModel(env),
      temperature: 0.8,
    },
  };

  const tokenRes = await liveAvatarFetch(apiKey, "/v1/sessions/token", {
    method: "POST",
    body: JSON.stringify(tokenBody),
  });
  const tokenData = (tokenRes.json.data ?? tokenRes.json) as Record<string, unknown>;
  const sessionToken = typeof tokenData.session_token === "string" ? tokenData.session_token : null;
  const tokenSessionId = typeof tokenData.session_id === "string" ? tokenData.session_id : null;
  if (!tokenRes.ok || !sessionToken) {
    log.error("liveavatar_token_failed", { status: tokenRes.status });
    throw new Error(`LIVEAVATAR_TOKEN_${tokenRes.status}`);
  }

  const startRes = await fetch(`${LIVEAVATAR_API}/v1/sessions/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({}),
  });
  const startText = await startRes.text();
  let startJson: Record<string, unknown> = {};
  try {
    startJson = startText ? (JSON.parse(startText) as Record<string, unknown>) : {};
  } catch {
    startJson = {};
  }
  const startData = (startJson.data ?? startJson) as Record<string, unknown>;
  if (!startRes.ok) {
    log.error("liveavatar_start_failed", { status: startRes.status });
    throw new Error(`LIVEAVATAR_START_${startRes.status}`);
  }

  return {
    sessionId: String(startData.session_id ?? tokenSessionId ?? ""),
    sessionToken,
    livekitUrl: String(startData.livekit_url ?? ""),
    livekitClientToken: String(startData.livekit_client_token ?? ""),
    mode: "LITE",
    provider: "liveavatar-openai",
    sandbox,
    avatarName: avatar.name,
  };
}

export async function stopLiveAvatarSession(sessionToken: string): Promise<void> {
  try {
    await fetch(`${LIVEAVATAR_API}/v1/sessions/stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    log.warn("liveavatar_stop_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
