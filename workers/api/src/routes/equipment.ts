import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import {
  camelizeRow,
  camelizeRows,
  getById,
  insertRow,
  nullIfBlank,
  selectAll,
  selectOne,
  updateRowById,
  type DbRow,
} from "../lib/d1-helpers";

export const equipmentRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

equipmentRoutes.use("*", requireAuth);

const fields = [
  "name",
  "type",
  "make",
  "model",
  "year",
  "serial_number",
  "smu_hours",
  "warranty_expiry",
  "notes",
  "status",
];

function customerId(c: { get: (key: "customerId" | "userId") => unknown }): number {
  const id = c.get("customerId");
  return typeof id === "number" ? id : Number(c.get("userId"));
}

function pick(body: DbRow): DbRow {
  const out: DbRow = {};
  for (const field of fields) {
    const camel = field.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[field] = nullIfBlank(body[camel] ?? body[field]);
  }
  return out;
}

equipmentRoutes.get("/", async (c) => {
  const rows = await selectAll<DbRow>(
    c.env.DB,
    "SELECT * FROM equipment WHERE customer_id = ?1 ORDER BY datetime(created_at) DESC, id DESC",
    customerId(c),
  );
  return c.json({ equipment: camelizeRows(rows) });
});

equipmentRoutes.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const name = String(body.name ?? `${body.make ?? ""} ${body.model ?? ""}`.trim()).trim();
  if (!name) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Name is required");
  }
  const id = await insertRow(c.env.DB, "equipment", {
    ...pick({ ...body, name }),
    customer_id: customerId(c),
    status: body.status ?? "active",
  });
  const row = await getById<DbRow>(c.env.DB, "equipment", id);
  return c.json({ equipment: camelizeRow(row) }, 201);
});

equipmentRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid id");
  }
  const owned = await selectOne<DbRow>(
    c.env.DB,
    "SELECT id FROM equipment WHERE id = ?1 AND customer_id = ?2",
    id,
    customerId(c),
  );
  if (!owned) return jsonError(c, 404, ErrorCode.NotFound, "Equipment not found");
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  await updateRowById(c.env.DB, "equipment", id, pick(body));
  const row = await getById<DbRow>(c.env.DB, "equipment", id);
  return c.json({ equipment: camelizeRow(row) });
});

equipmentRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid id");
  }
  const r = await c.env.DB
    .prepare("DELETE FROM equipment WHERE id = ?1 AND customer_id = ?2")
    .bind(id, customerId(c))
    .run();
  if (!r.meta.changes) return jsonError(c, 404, ErrorCode.NotFound, "Equipment not found");
  return c.json({ ok: true });
});
