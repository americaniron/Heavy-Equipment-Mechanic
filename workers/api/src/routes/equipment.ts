import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { EquipmentInput, EquipmentPatch } from "../lib/equipment-schema";

export const equipmentRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

equipmentRoutes.use("*", requireAuth);

const IdParam = z.object({ id: z.string().uuid() });

interface EquipmentRow {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  serial: string | null;
  hours: number | null;
  created_at: number;
  updated_at: number;
}

equipmentRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const r = await c.env.DB.prepare(
    "SELECT * FROM equipment WHERE user_id = ?1 ORDER BY created_at DESC",
  )
    .bind(userId)
    .all<EquipmentRow>();
  return c.json({ equipment: r.results ?? [] });
});

equipmentRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => null);
  const parsed = EquipmentInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      c,
      400,
      ErrorCode.BadRequest,
      "Invalid equipment input",
      parsed.error.issues[0]?.message,
    );
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO equipment (id, user_id, make, model, year, serial, hours, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch(), unixepoch())`,
  )
    .bind(
      id,
      userId,
      parsed.data.make,
      parsed.data.model,
      parsed.data.year,
      parsed.data.serial,
      parsed.data.hours,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM equipment WHERE id = ?1")
    .bind(id)
    .first<EquipmentRow>();
  return c.json({ equipment: row }, 201);
});

equipmentRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const params = IdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) return jsonError(c, 400, ErrorCode.BadRequest, "Invalid id");
  const body = await c.req.json().catch(() => null);
  const parsed = EquipmentPatch.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid patch");
  }
  // Build a partial UPDATE only over keys actually present.
  const sets: string[] = [];
  const binds: unknown[] = [];
  let i = 1;
  for (const k of ["make", "model", "year", "serial", "hours"] as const) {
    if (parsed.data[k] !== undefined) {
      sets.push(`${k} = ?${i++}`);
      binds.push(parsed.data[k]);
    }
  }
  if (sets.length === 0) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Nothing to update");
  }
  sets.push(`updated_at = unixepoch()`);
  // Owned-by-user gate on the WHERE clause.
  binds.push(params.data.id, userId);
  const sql =
    `UPDATE equipment SET ${sets.join(", ")} WHERE id = ?${i++} AND user_id = ?${i++}`;
  const r = await c.env.DB.prepare(sql)
    .bind(...binds)
    .run();
  if (!r.meta.changes) {
    return jsonError(c, 404, ErrorCode.NotFound, "Equipment not found");
  }
  const row = await c.env.DB.prepare("SELECT * FROM equipment WHERE id = ?1")
    .bind(params.data.id)
    .first<EquipmentRow>();
  return c.json({ equipment: row });
});

equipmentRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const params = IdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) return jsonError(c, 400, ErrorCode.BadRequest, "Invalid id");
  const r = await c.env.DB.prepare(
    "DELETE FROM equipment WHERE id = ?1 AND user_id = ?2",
  )
    .bind(params.data.id, userId)
    .run();
  if (!r.meta.changes) {
    return jsonError(c, 404, ErrorCode.NotFound, "Equipment not found");
  }
  return c.json({ ok: true });
});
