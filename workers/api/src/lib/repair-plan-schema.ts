import { z } from "zod";

export const RepairStep = z.object({
  step: z.string().min(1),
  time_min: z.number().min(1),
  prerequisites: z.array(z.string().min(1)).default([]),
});
export type RepairStep = z.infer<typeof RepairStep>;

export const RepairPlanOutput = z
  .object({
    labor_hours_estimate: z.number().min(0),
    required_tools: z.array(z.string().min(1)).min(1).max(15),
    downtime_days_projection: z.number().min(0),
    suggested_sequence: z.array(RepairStep).min(2).max(20),
    total_parts_cost_usd: z.number().min(0),
    total_labor_cost_usd_low: z.number().min(0),
    total_labor_cost_usd_high: z.number().min(0),
  })
  .refine(
    (v) => v.total_labor_cost_usd_low <= v.total_labor_cost_usd_high,
    {
      message: "total_labor_cost_usd_low must be <= total_labor_cost_usd_high",
      path: ["total_labor_cost_usd_low"],
    },
  );
export type RepairPlanOutput = z.infer<typeof RepairPlanOutput>;

export const RepairPlanInput = z.object({
  session_id: z.union([
    z.string().uuid(),
    z.coerce.number().int().positive().transform((value) => String(value)),
  ]),
});
export type RepairPlanInput = z.infer<typeof RepairPlanInput>;
