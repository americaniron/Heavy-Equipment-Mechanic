import { describe, expect, it } from "vitest";
import { checkAndIncrement } from "../src/lib/ratelimit";
import type { Env } from "../src/env";

/** In-memory KV stub. Tracks puts so we can assert TTLs. */
function makeKv() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  const kv = {
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ): Promise<void> {
      store.set(key, value);
      puts.push({ key, value, ttl: opts?.expirationTtl });
    },
  };
  return { kv: kv as unknown as KVNamespace, store, puts };
}

function makeEnv(kv: KVNamespace): Env {
  // Only RATE_LIMITS is exercised; rest are unused stubs.
  return { RATE_LIMITS: kv } as unknown as Env;
}

describe("checkAndIncrement", () => {
  it("allows the first N requests and writes growing counts", async () => {
    const { kv, store } = makeKv();
    const env = makeEnv(kv);
    const fixedNow = (): number => 1_700_000_000_000; // any deterministic ms
    for (let i = 0; i < 5; i++) {
      const r = await checkAndIncrement({
        env,
        userId: "u_a",
        max: 5,
        now: fixedNow,
      });
      expect(r.ok).toBe(true);
    }
    // 5 calls — counter should be at 5.
    const onlyKey = [...store.keys()].find((k) => k.startsWith("rl:"));
    expect(onlyKey).toBeDefined();
    expect(store.get(onlyKey as string)).toBe("5");
  });

  it("denies on the (max+1)th request in the same window", async () => {
    const { kv } = makeKv();
    const env = makeEnv(kv);
    const fixedNow = (): number => 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement({ env, userId: "u_b", max: 3, now: fixedNow });
    }
    const r = await checkAndIncrement({
      env,
      userId: "u_b",
      max: 3,
      now: fixedNow,
    });
    expect(r.ok).toBe(false);
  });

  it("isolates users from each other", async () => {
    const { kv } = makeKv();
    const env = makeEnv(kv);
    const fixedNow = (): number => 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement({ env, userId: "u_a", max: 3, now: fixedNow });
    }
    const a = await checkAndIncrement({
      env,
      userId: "u_a",
      max: 3,
      now: fixedNow,
    });
    expect(a.ok).toBe(false);
    const b = await checkAndIncrement({
      env,
      userId: "u_b",
      max: 3,
      now: fixedNow,
    });
    expect(b.ok).toBe(true);
  });

  it("rolls over to a fresh budget in the next hour", async () => {
    const { kv } = makeKv();
    const env = makeEnv(kv);
    const HOUR = 60 * 60 * 1000;
    const tHour1 = (): number => 1_700_000_000_000;
    const tHour2 = (): number => 1_700_000_000_000 + HOUR;
    for (let i = 0; i < 3; i++) {
      await checkAndIncrement({ env, userId: "u_c", max: 3, now: tHour1 });
    }
    const denied = await checkAndIncrement({
      env,
      userId: "u_c",
      max: 3,
      now: tHour1,
    });
    expect(denied.ok).toBe(false);
    const fresh = await checkAndIncrement({
      env,
      userId: "u_c",
      max: 3,
      now: tHour2,
    });
    expect(fresh.ok).toBe(true);
  });

  it("writes a TTL >= 60 (KV minimum)", async () => {
    const { kv, puts } = makeKv();
    const env = makeEnv(kv);
    // Put 'now' at 5 seconds before the hour boundary so resetMs is 5000.
    const HOUR = 60 * 60 * 1000;
    const nearEnd = (): number => Math.floor(Date.now() / HOUR) * HOUR + HOUR - 5_000;
    await checkAndIncrement({ env, userId: "u_d", max: 3, now: nearEnd });
    expect(puts[0]?.ttl).toBeGreaterThanOrEqual(60);
  });
});
