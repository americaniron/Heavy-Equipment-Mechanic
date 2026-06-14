import { z } from "zod";

export const PredictionRow = z.object({
  equipment_id: z.union([
    z.string().uuid(),
    z.coerce.number().int().positive().transform((value) => String(value)),
  ]),
  risk_score: z.number().int().min(0).max(100),
  predicted_failure_window: z.string().min(1),
  recommended_action: z.string().min(1),
  confidence: z.number().min(0).max(1),
  based_on_diagnoses: z.number().int().min(0),
});
export type PredictionRow = z.infer<typeof PredictionRow>;

export const PredictiveOutput = z.object({
  predictions: z.array(PredictionRow).min(0),
});
export type PredictiveOutput = z.infer<typeof PredictiveOutput>;
