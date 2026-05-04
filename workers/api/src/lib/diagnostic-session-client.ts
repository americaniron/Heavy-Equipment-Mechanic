/**
 * Worker-side client for talking to the DiagnosticSession Durable Object.
 * The DO id is derived deterministically from `${userId}:${sessionId}`
 * via idFromName so the same key always lands on the same DO instance.
 */
import type { Env } from "../env";

interface SessionMetaInit {
  tierAtCreation: "free" | "pro" | "shop";
  mode: "scenario" | "chat" | "wizard";
  equipmentId?: string | undefined;
  modelUsed?: string | undefined;
}

interface SessionStateResponse {
  meta: {
    tierAtCreation: "free" | "pro" | "shop";
    createdAt: number;
    mode: "scenario" | "chat" | "wizard";
    equipmentId?: string;
    modelUsed?: string;
  } | null;
  turns: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    ts: number;
  }>;
  playbook: unknown | null;
  input: unknown | null;
}

function getStub(env: Env, userId: string, sessionId: string) {
  const id = env.DIAGNOSTIC_SESSION.idFromName(`${userId}:${sessionId}`);
  return env.DIAGNOSTIC_SESSION.get(id);
}

async function call<T>(
  env: Env,
  userId: string,
  sessionId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const stub = getStub(env, userId, sessionId);
  const init: RequestInit = body
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    : { method: "GET" };
  // Hostname is irrelevant for DO requests but must be a valid URL.
  const res = await stub.fetch(`https://do.local${path}`, init);
  if (!res.ok) {
    throw new Error(`DO ${path} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export const diagnosticSession = {
  async init(env: Env, userId: string, sessionId: string, meta: SessionMetaInit) {
    return call<{ ok: boolean }>(env, userId, sessionId, "/__do/init", meta);
  },
  async appendTurn(
    env: Env,
    userId: string,
    sessionId: string,
    turn: {
      role: "user" | "assistant" | "system";
      content: string;
      ts?: number;
    },
  ) {
    return call<{ ok: boolean; turnCount: number }>(
      env,
      userId,
      sessionId,
      "/__do/append-turn",
      { ts: turn.ts ?? Date.now(), ...turn },
    );
  },
  async setPlaybook(env: Env, userId: string, sessionId: string, playbook: unknown) {
    return call(env, userId, sessionId, "/__do/set-playbook", playbook);
  },
  async setInput(env: Env, userId: string, sessionId: string, input: unknown) {
    return call(env, userId, sessionId, "/__do/set-input", input);
  },
  async getState(env: Env, userId: string, sessionId: string) {
    return call<SessionStateResponse>(env, userId, sessionId, "/__do/state");
  },
};
