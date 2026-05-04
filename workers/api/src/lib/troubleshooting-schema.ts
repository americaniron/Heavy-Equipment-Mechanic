import { z } from "zod";

/**
 * Wizard turn output schema. The model returns one of these per call.
 * `terminate=true` signals "no more questions", with a conclusion block.
 */

export const Confidence = z.enum(["high", "medium", "low"]);

export const Conclusion = z.object({
  summary: z.string().min(1),
  confidence: Confidence,
  next_steps: z.array(z.string().min(1)).min(1).max(8),
  safety_warnings: z.array(z.string().min(1)).max(6).default([]),
});
export type Conclusion = z.infer<typeof Conclusion>;

const baseFields = {
  reasoning: z.string().min(1),
};

export const ContinuationTurn = z.object({
  ...baseFields,
  question: z.string().min(1),
  suggested_answers: z.array(z.string().min(1)).min(2).max(6),
  terminate: z.literal(false),
});

export const TerminationTurn = z.object({
  ...baseFields,
  question: z.string().default(""),
  suggested_answers: z.array(z.string()).default([]),
  terminate: z.literal(true),
  conclusion: Conclusion,
});

export const WizardTurn = z.discriminatedUnion("terminate", [
  ContinuationTurn,
  TerminationTurn,
]);
export type WizardTurn = z.infer<typeof WizardTurn>;

export const StartInput = z.object({
  machine_make: z.string().min(1).max(80),
  machine_model: z.string().min(1).max(80),
  initial_complaint: z.string().min(3).max(2_000),
});
export type StartInput = z.infer<typeof StartInput>;

export const AnswerInput = z.object({
  answer: z.string().min(1).max(2_000),
});
export type AnswerInput = z.infer<typeof AnswerInput>;
