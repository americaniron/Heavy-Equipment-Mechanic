import { describe, expect, it } from "vitest";
import {
  ChatInput,
  ScenarioInput,
  ScenarioOutput,
} from "../src/lib/diagnosis-schema";

describe("ScenarioInput", () => {
  it("accepts a complete payload", () => {
    const r = ScenarioInput.safeParse({
      machine_make: "Caterpillar",
      machine_model: "350G",
      year: 2018,
      hours: 6_400,
      symptoms: "Loss of hydraulic pressure under load. Slow boom raise.",
      fault_codes: ["E197-2", "E390-2"],
      recent_service: ["Hydraulic filter changed at 6300 hr"],
      operator_notes: "Started after a long dig in mud yesterday.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty machine_make", () => {
    const r = ScenarioInput.safeParse({
      machine_make: "",
      machine_model: "350G",
      symptoms: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("rejects symptoms shorter than 3 chars", () => {
    const r = ScenarioInput.safeParse({
      machine_make: "CAT",
      machine_model: "350G",
      symptoms: "ab",
    });
    expect(r.success).toBe(false);
  });

  it("defaults arrays/strings when omitted", () => {
    const r = ScenarioInput.safeParse({
      machine_make: "CAT",
      machine_model: "350G",
      symptoms: "Slow boom raise.",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fault_codes).toEqual([]);
      expect(r.data.recent_service).toEqual([]);
      expect(r.data.operator_notes).toBe("");
      expect(r.data.year).toBeNull();
      expect(r.data.hours).toBeNull();
    }
  });
});

describe("ChatInput", () => {
  it("requires a non-empty message", () => {
    expect(ChatInput.safeParse({ message: "" }).success).toBe(false);
    expect(ChatInput.safeParse({ message: "hi there" }).success).toBe(true);
  });
});

describe("ScenarioOutput", () => {
  const minimal = {
    possible_causes: [
      { cause: "Pump cavitation", likelihood: "high", reasoning: "Slow boom + recent mud immersion suggest air ingress." },
    ],
    tests_in_order: [
      {
        test: "Visual inspect suction screen for blockage",
        tools: ["flashlight"],
        expected_reading_pass: "Screen clean, no debris",
        expected_reading_fail: "Debris pack covering >25% of screen",
      },
    ],
    expected_readings: {},
    parts_likely_needed: [],
    safety_warnings: ["Lower boom and crib it before any hydraulic disconnect."],
  };

  it("accepts a minimal-but-valid playbook", () => {
    expect(ScenarioOutput.safeParse(minimal).success).toBe(true);
  });

  it("rejects a likelihood outside the enum", () => {
    const r = ScenarioOutput.safeParse({
      ...minimal,
      possible_causes: [{ ...minimal.possible_causes[0]!, likelihood: "kinda" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty possible_causes array", () => {
    const r = ScenarioOutput.safeParse({ ...minimal, possible_causes: [] });
    expect(r.success).toBe(false);
  });

  it("caps possible_causes at 6", () => {
    const seven = Array(7).fill(minimal.possible_causes[0]!);
    const r = ScenarioOutput.safeParse({ ...minimal, possible_causes: seven });
    expect(r.success).toBe(false);
  });

  it("permits empty parts_likely_needed and safety_warnings", () => {
    const r = ScenarioOutput.safeParse({
      ...minimal,
      parts_likely_needed: [],
      safety_warnings: [],
    });
    expect(r.success).toBe(true);
  });
});
