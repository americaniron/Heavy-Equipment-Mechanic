import { describe, expect, it } from "vitest";
import { OPENAI_REALTIME_MODEL } from "../src/lib/liveavatar";
import { OPENAI_TRANSCRIBE_MODEL } from "../src/routes/transcribe";

/**
 * Regression guards for OpenAI model currency (FIX A / FIX B).
 *
 * These assert the configured defaults match the vendor's CURRENT
 * non-deprecated replacements so a silent drift back to a deprecated model
 * (which shuts down and would break prod) is caught in CI.
 *
 * FIX A: `gpt-realtime` (shutdown 2027-01-20) -> `gpt-realtime-2.1`
 * FIX B: `whisper-1`    (shutdown 2027-02-26) -> `gpt-transcribe`
 * Ref: https://developers.openai.com/api/docs/deprecations
 */
describe("OpenAI model defaults are the current GA replacements", () => {
  it("uses gpt-realtime-2.1 for the LiveAvatar Realtime config (not deprecated gpt-realtime)", () => {
    expect(OPENAI_REALTIME_MODEL).toBe("gpt-realtime-2.1");
    expect(OPENAI_REALTIME_MODEL).not.toBe("gpt-realtime");
  });

  it("uses gpt-transcribe for /v1/audio/transcriptions (not deprecated whisper-1)", () => {
    expect(OPENAI_TRANSCRIBE_MODEL).toBe("gpt-transcribe");
    expect(OPENAI_TRANSCRIBE_MODEL).not.toBe("whisper-1");
  });
});
