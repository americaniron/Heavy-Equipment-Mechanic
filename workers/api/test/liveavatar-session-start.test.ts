import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiteOpenAiSession } from "../src/lib/liveavatar";

function kv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

const env = {
  SESSIONS: kv(),
  APP_ENV: "production",
  LIVEAVATAR_API_KEY: "liveavatar-test-key",
  OPENAI_API_KEY: "sk-openai-test",
} as any;

describe("createLiteOpenAiSession (repair)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns LiveKit credentials after token + start succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v1/secrets")) {
          return new Response(JSON.stringify({ data: { id: "secret-abc" } }), { status: 200 });
        }
        if (url.includes("/v1/sessions/token")) {
          return new Response(
            JSON.stringify({
              data: { session_token: "sess-token-xyz", session_id: "sess-id-1" },
            }),
            { status: 200 },
          );
        }
        if (url.includes("/v1/sessions/start")) {
          expect(init?.headers).toMatchObject({
            authorization: "Bearer sess-token-xyz",
          });
          return new Response(
            JSON.stringify({
              data: {
                session_id: "sess-id-1",
                livekit_url: "wss://livekit.example.com",
                livekit_client_token: "lk-client-jwt",
              },
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const session = await createLiteOpenAiSession(env, { agentType: "admin", language: "en" });
    expect(session.mode).toBe("LITE");
    expect(session.provider).toBe("liveavatar-openai");
    expect(session.sessionToken).toBe("sess-token-xyz");
    expect(session.livekitUrl).toBe("wss://livekit.example.com");
    expect(session.livekitClientToken).toBe("lk-client-jwt");
    expect(session.sandbox).toBe(false);
    expect(session.avatarName).toBe("Sarah");
  });
});
