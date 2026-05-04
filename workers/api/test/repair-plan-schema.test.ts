import { describe, expect, it } from "vitest";
import {
  RepairPlanInput,
  RepairPlanOutput,
} from "../src/lib/repair-plan-schema";

describe("RepairPlanInput", () => {
  it("requires a uuid session_id", () => {
    expect(
      RepairPlanInput.safeParse({ session_id: "00000000-0000-4000-8000-000000000000" }).success,
    ).toBe(true);
    expect(RepairPlanInput.safeParse({ session_id: "not-a-uuid" }).success).toBe(false);
    expect(RepairPlanInput.safeParse({}).success).toBe(false);
  });
});

describe("RepairPlanOutput", () => {
  const minimal = {
    labor_hours_estimate: 4.5,
    required_tools: ["3/4\" drive impact", "torque wrench 50-250 ft-lb"],
    downtime_days_projection: 1,
    suggested_sequence: [
      { step: "Drain hydraulic reservoir.", time_min: 30, prerequisites: [] },
      { step: "Remove suction screen access cover.", time_min: 20, prerequisites: ["Drain hydraulic reservoir."] },
    ],
    total_parts_cost_usd: 142.5,
    total_labor_cost_usd_low: 427.5,
    total_labor_cost_usd_high: 742.5,
  };

  it("accepts a minimal valid plan", () => {
    expect(RepairPlanOutput.safeParse(minimal).success).toBe(true);
  });

  it("rejects when low > high labor cost", () => {
    expect(
      RepairPlanOutput.safeParse({
        ...minimal,
        total_labor_cost_usd_low: 1000,
        total_labor_cost_usd_high: 500,
      }).success,
    ).toBe(false);
  });

  it("rejects fewer than 2 sequence steps", () => {
    expect(
      RepairPlanOutput.safeParse({
        ...minimal,
        suggested_sequence: [minimal.suggested_sequence[0]!],
      }).success,
    ).toBe(false);
  });

  it("caps sequence at 20 steps", () => {
    expect(
      RepairPlanOutput.safeParse({
        ...minimal,
        suggested_sequence: Array(21).fill(minimal.suggested_sequence[0]!),
      }).success,
    ).toBe(false);
  });

  it("requires step time_min >= 1", () => {
    expect(
      RepairPlanOutput.safeParse({
        ...minimal,
        suggested_sequence: [
          { step: "Free step", time_min: 0, prerequisites: [] },
          minimal.suggested_sequence[1]!,
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects negative numerics", () => {
    expect(
      RepairPlanOutput.safeParse({ ...minimal, total_parts_cost_usd: -1 }).success,
    ).toBe(false);
    expect(
      RepairPlanOutput.safeParse({ ...minimal, downtime_days_projection: -1 }).success,
    ).toBe(false);
  });

  it("requires at least 1 tool", () => {
    expect(
      RepairPlanOutput.safeParse({ ...minimal, required_tools: [] }).success,
    ).toBe(false);
  });
});
