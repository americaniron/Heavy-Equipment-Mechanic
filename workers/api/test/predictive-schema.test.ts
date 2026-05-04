import { describe, expect, it } from "vitest";
import { PredictiveOutput } from "../src/lib/predictive-schema";

const oneRow = {
  equipment_id: "00000000-0000-4000-8000-000000000001",
  risk_score: 35,
  predicted_failure_window: "30-60 days at current duty cycle",
  recommended_action: "Pull oil sample at next service; screen for iron + chrome.",
  confidence: 0.55,
  based_on_diagnoses: 2,
};

describe("PredictiveOutput", () => {
  it("accepts an empty predictions array", () => {
    expect(PredictiveOutput.safeParse({ predictions: [] }).success).toBe(true);
  });
  it("accepts a valid prediction", () => {
    expect(PredictiveOutput.safeParse({ predictions: [oneRow] }).success).toBe(true);
  });
  it("rejects risk_score out of 0..100", () => {
    expect(
      PredictiveOutput.safeParse({ predictions: [{ ...oneRow, risk_score: 101 }] }).success,
    ).toBe(false);
    expect(
      PredictiveOutput.safeParse({ predictions: [{ ...oneRow, risk_score: -1 }] }).success,
    ).toBe(false);
  });
  it("rejects confidence out of 0..1", () => {
    expect(
      PredictiveOutput.safeParse({ predictions: [{ ...oneRow, confidence: 1.5 }] }).success,
    ).toBe(false);
  });
  it("rejects non-uuid equipment_id", () => {
    expect(
      PredictiveOutput.safeParse({
        predictions: [{ ...oneRow, equipment_id: "not-a-uuid" }],
      }).success,
    ).toBe(false);
  });
  it("rejects empty action string", () => {
    expect(
      PredictiveOutput.safeParse({
        predictions: [{ ...oneRow, recommended_action: "" }],
      }).success,
    ).toBe(false);
  });
});
