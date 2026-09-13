import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("background job configuration", () => {
  it("does not publish unimplemented jobs or configure a black-hole consumer", () => {
    const productionConfig = readFileSync(
      new URL("../wrangler.prod.toml", import.meta.url),
      "utf8",
    );
    const stagingConfig = readFileSync(
      new URL("../wrangler.toml", import.meta.url),
      "utf8",
    );
    const workerEntry = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    const envTypes = readFileSync(
      new URL("../src/env.ts", import.meta.url),
      "utf8",
    );

    for (const config of [productionConfig, stagingConfig]) {
      expect(config).not.toMatch(/\[\[queues\.(?:producers|consumers)\]\]/);
      expect(config).not.toMatch(/\[triggers\][\s\S]*crons\s*=/);
      expect(config).not.toContain("fixmyiron-jobs");
    }
    expect(workerEntry).not.toMatch(/\bscheduled\s*\(/);
    expect(envTypes).not.toMatch(/\bJOBS\s*:/);
  });
});
