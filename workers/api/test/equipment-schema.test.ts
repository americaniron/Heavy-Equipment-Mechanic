import { describe, expect, it } from "vitest";
import {
  EquipmentInput,
  EquipmentPatch,
} from "../src/lib/equipment-schema";

describe("EquipmentInput", () => {
  it("accepts minimal valid", () => {
    expect(
      EquipmentInput.safeParse({ make: "CAT", model: "350G" }).success,
    ).toBe(true);
  });
  it("defaults nullable fields", () => {
    const r = EquipmentInput.safeParse({ make: "CAT", model: "350G" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.year).toBeNull();
      expect(r.data.serial).toBeNull();
      expect(r.data.hours).toBeNull();
    }
  });
  it("rejects empty make", () => {
    expect(EquipmentInput.safeParse({ make: "", model: "350G" }).success).toBe(false);
  });
  it("clamps year sanity", () => {
    expect(EquipmentInput.safeParse({ make: "CAT", model: "350G", year: 1849 }).success).toBe(false);
    expect(EquipmentInput.safeParse({ make: "CAT", model: "350G", year: 2200 }).success).toBe(false);
  });
  it("clamps hours sanity", () => {
    expect(EquipmentInput.safeParse({ make: "CAT", model: "350G", hours: -1 }).success).toBe(false);
    expect(EquipmentInput.safeParse({ make: "CAT", model: "350G", hours: 250000 }).success).toBe(false);
  });
});

describe("EquipmentPatch", () => {
  it("accepts an empty patch", () => {
    expect(EquipmentPatch.safeParse({}).success).toBe(true);
  });
  it("accepts a partial patch", () => {
    const r = EquipmentPatch.safeParse({ hours: 6500 });
    expect(r.success).toBe(true);
  });
  it("still rejects bad values", () => {
    expect(EquipmentPatch.safeParse({ year: 9999 }).success).toBe(false);
  });
});
