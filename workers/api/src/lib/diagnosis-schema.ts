import { z } from "zod";

/**
 * Strict JSON schema for the Diagnosis Engine "scenario" output. Used
 * to validate Claude's reply before persisting; on validation failure
 * the route returns 502 UPSTREAM_ERROR with the zod issue for the
 * client to display ("Try again — the model returned malformed
 * output").
 */

export const Likelihood = z.enum(["high", "medium", "low"]);

export const PossibleCause = z.object({
  cause: z.string().min(1),
  likelihood: Likelihood,
  reasoning: z.string().min(1),
});

export const DiagnosticTest = z.object({
  test: z.string().min(1),
  tools: z.array(z.string()).default([]),
  expected_reading_pass: z.string().min(1),
  expected_reading_fail: z.string().min(1),
});

export const PartLikelyNeeded = z.object({
  part_number: z.string(),
  description: z.string().min(1),
  why: z.string().min(1),
});

export const ScenarioOutput = z.object({
  possible_causes: z.array(PossibleCause).min(1).max(6),
  tests_in_order: z.array(DiagnosticTest).min(1).max(10),
  expected_readings: z.record(z.string(), z.string()).default({}),
  parts_likely_needed: z.array(PartLikelyNeeded).max(12).default([]),
  safety_warnings: z.array(z.string()).max(8).default([]),
});
export type ScenarioOutput = z.infer<typeof ScenarioOutput>;

/** Input shape (the form payload the user submits). */
export const ScenarioInput = z.object({
  machine_make: z.string().min(1).max(80),
  machine_model: z.string().min(1).max(80),
  year: z.number().int().min(1950).max(2100).nullable().default(null),
  hours: z.number().int().min(0).max(200_000).nullable().default(null),
  symptoms: z.string().min(3).max(4_000),
  fault_codes: z.array(z.string().min(1).max(40)).max(50).default([]),
  recent_service: z.array(z.string().min(1).max(400)).max(50).default([]),
  operator_notes: z.string().max(2_000).default(""),
});
export type ScenarioInput = z.infer<typeof ScenarioInput>;

/** Plain chat (free-tier and follow-ups) — input is just a message. */
export const ChatInput = z.object({
  message: z.string().min(1).max(4_000),
});
export type ChatInput = z.infer<typeof ChatInput>;
