import { describe, expect, it } from "vitest";
import {
  AnswerInput,
  StartInput,
  WizardTurn,
} from "../src/lib/troubleshooting-schema";

describe("StartInput", () => {
  it("accepts minimal valid", () => {
    expect(
      StartInput.safeParse({
        machine_make: "CAT",
        machine_model: "350G",
        initial_complaint: "Slow boom raise.",
      }).success,
    ).toBe(true);
  });
  it("rejects empty machine_make", () => {
    expect(
      StartInput.safeParse({
        machine_make: "",
        machine_model: "350G",
        initial_complaint: "abc",
      }).success,
    ).toBe(false);
  });
});

describe("WizardTurn — continuation", () => {
  const sample = {
    question: "When did the slow boom start?",
    reasoning: "Onset timing helps separate gradual wear from acute failure.",
    suggested_answers: ["Today", "This week", "This month", "Don't know"],
    terminate: false,
  };
  it("accepts a valid continuation turn", () => {
    expect(WizardTurn.safeParse(sample).success).toBe(true);
  });
  it("rejects fewer than 2 suggested answers", () => {
    expect(
      WizardTurn.safeParse({ ...sample, suggested_answers: ["Yes"] }).success,
    ).toBe(false);
  });
  it("rejects more than 6 suggested answers", () => {
    expect(
      WizardTurn.safeParse({
        ...sample,
        suggested_answers: ["a", "b", "c", "d", "e", "f", "g"],
      }).success,
    ).toBe(false);
  });
  it("rejects empty question", () => {
    expect(WizardTurn.safeParse({ ...sample, question: "" }).success).toBe(false);
  });
});

describe("WizardTurn — termination", () => {
  const term = {
    question: "",
    reasoning: "Symptoms point unambiguously to a clogged suction screen.",
    suggested_answers: [],
    terminate: true,
    conclusion: {
      summary: "Clogged hydraulic suction screen, secondary to mud ingress.",
      confidence: "high",
      next_steps: ["Stop work, lower attachment, crib safely", "Pull and clean suction screen"],
      safety_warnings: ["Lower boom and crib it before any disconnect."],
    },
  };
  it("accepts a valid termination turn", () => {
    expect(WizardTurn.safeParse(term).success).toBe(true);
  });
  it("requires next_steps non-empty", () => {
    expect(
      WizardTurn.safeParse({
        ...term,
        conclusion: { ...term.conclusion, next_steps: [] },
      }).success,
    ).toBe(false);
  });
  it("rejects bad confidence value", () => {
    expect(
      WizardTurn.safeParse({
        ...term,
        conclusion: { ...term.conclusion, confidence: "very-high" },
      }).success,
    ).toBe(false);
  });
  it("permits empty safety_warnings", () => {
    expect(
      WizardTurn.safeParse({
        ...term,
        conclusion: { ...term.conclusion, safety_warnings: [] },
      }).success,
    ).toBe(true);
  });
});

describe("AnswerInput", () => {
  it("requires non-empty answer", () => {
    expect(AnswerInput.safeParse({ answer: "" }).success).toBe(false);
    expect(AnswerInput.safeParse({ answer: "Yes" }).success).toBe(true);
  });
});
