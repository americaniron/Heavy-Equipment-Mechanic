import { z } from "zod";

export const EquipmentInput = z.object({
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  year: z.number().int().min(1950).max(2100).nullable().default(null),
  serial: z.string().max(60).nullable().default(null),
  hours: z.number().int().min(0).max(200_000).nullable().default(null),
});
export type EquipmentInput = z.infer<typeof EquipmentInput>;

export const EquipmentPatch = EquipmentInput.partial();
export type EquipmentPatch = z.infer<typeof EquipmentPatch>;
