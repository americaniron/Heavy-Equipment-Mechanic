import { describe, expect, it } from "vitest";
import { liveAvatarApiKey } from "../src/lib/liveavatar";
import type { Env } from "../src/env";

describe("liveAvatarApiKey", () => {
  it("accepts either current secret name without renaming blindly", () => {
    expect(liveAvatarApiKey({ LIVEAVATAR_API_KEY: "la_1" } as Env)).toBe("la_1");
    expect(liveAvatarApiKey({ HEYGEN_API_KEY: "hg_1" } as Env)).toBe("hg_1");
    expect(liveAvatarApiKey({ LIVEAVATAR_API_KEY: "la_1", HEYGEN_API_KEY: "hg_1" } as Env)).toBe("la_1");
  });
});
