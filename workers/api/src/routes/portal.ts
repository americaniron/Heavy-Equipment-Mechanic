import { Hono, type Context } from "hono";
import type { Env, Variables } from "../env";
import { requireAuth } from "../lib/auth-middleware";
import { createCheckoutSession, createCustomerPortalSession } from "../lib/stripe-billing";
import { effectiveTier } from "../lib/tier";
import { normalizeFaultCode } from "../lib/fault-normalize";
import {
  camelizeRow,
  camelizeRows,
  getById,
  insertRow,
  nullIfBlank,
  numberOrNull,
  publicCustomer,
  selectAll,
  selectOne,
  updateRowById,
  type DbRow,
} from "../lib/d1-helpers";

export const portalRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
type PortalContext = Context<{ Bindings: Env; Variables: Variables }>;

portalRoutes.use("*", requireAuth);

function customerId(c: { get: (key: "customerId" | "userId") => unknown }): number {
  const explicit = c.get("customerId");
  if (typeof explicit === "number") return explicit;
  return Number(c.get("userId"));
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function pick(body: DbRow, fields: string[], aliases: Record<string, string> = {}): DbRow {
  const out: DbRow = {};
  for (const field of fields) {
    const bodyKey = aliases[field] ?? field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[field] = nullIfBlank(body[bodyKey] ?? body[field]);
  }
  return out;
}

async function listForCustomer(db: D1Database, table: string, cid: number): Promise<DbRow[]> {
  const rows = await selectAll<DbRow>(
    db,
    `SELECT * FROM "${table}" WHERE customer_id = ?1 ORDER BY datetime(created_at) DESC, id DESC`,
    cid,
  );
  return camelizeRows(rows);
}

async function createForCustomer(
  db: D1Database,
  table: string,
  cid: number,
  data: DbRow,
): Promise<DbRow> {
  const id = await insertRow(db, table, { ...data, customer_id: cid });
  const row = await getById<DbRow>(db, table, id);
  return camelizeRow(row) ?? {};
}

async function updateOwned(
  db: D1Database,
  table: string,
  id: number,
  cid: number,
  data: DbRow,
): Promise<DbRow | null> {
  const existing = await selectOne<DbRow>(
    db,
    `SELECT id FROM "${table}" WHERE id = ?1 AND customer_id = ?2`,
    id,
    cid,
  );
  if (!existing) return null;
  await updateRowById(db, table, id, data);
  const row = await getById<DbRow>(db, table, id);
  return camelizeRow(row);
}

function likePattern(input: string): string {
  return `%${input.replace(/[%_]/g, "\\$&")}%`;
}

// ---------------------------------------------------------------- dashboard

portalRoutes.get("/dashboard", async (c) => {
  const cid = customerId(c);
  const [equipment, serviceRequests, tickets, invoices, sessions] = await Promise.all([
    listForCustomer(c.env.DB, "equipment", cid),
    listForCustomer(c.env.DB, "service_requests", cid),
    listForCustomer(c.env.DB, "support_tickets", cid),
    listForCustomer(c.env.DB, "invoices", cid),
    listForCustomer(c.env.DB, "sessions", cid),
  ]);
  return c.json({
    equipmentCount: equipment.length,
    activeEquipment: equipment.filter((e) => e.status === "active").length,
    openServiceRequests: serviceRequests.filter((s) =>
      s.status === "open" || s.status === "in_progress",
    ).length,
    totalServiceRequests: serviceRequests.length,
    openTickets: tickets.filter((t) => t.status === "open").length,
    pendingInvoices: invoices.filter((i) => i.status === "pending").length,
    totalSessions: sessions.length,
    recentServiceRequests: serviceRequests.slice(0, 5),
    recentSessions: sessions.slice(0, 5),
  });
});

// ---------------------------------------------------------------- equipment

const equipmentFields = [
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

portalRoutes.get("/equipment", async (c) => c.json(await listForCustomer(c.env.DB, "equipment", customerId(c))));

portalRoutes.post("/equipment", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  if (!body.name) return c.json({ error: "Name is required" }, 400);
  return c.json(await createForCustomer(c.env.DB, "equipment", customerId(c), pick(body, equipmentFields)));
});

async function updateEquipment(c: PortalContext) {
  const id = parseId(String(c.req.param("id")));
  if (!id) return c.json({ error: "Invalid equipment id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const updated = await updateOwned(c.env.DB, "equipment", id, customerId(c), pick(body, equipmentFields));
  if (!updated) return c.json({ error: "Equipment not found" }, 404);
  return c.json(updated);
}

portalRoutes.patch("/equipment/:id", updateEquipment);
portalRoutes.put("/equipment/:id", updateEquipment);

portalRoutes.delete("/equipment/:id", async (c) => {
  const id = parseId(String(c.req.param("id")));
  if (!id) return c.json({ error: "Invalid equipment id" }, 400);
  const result = await c.env.DB
    .prepare("DELETE FROM equipment WHERE id = ?1 AND customer_id = ?2")
    .bind(id, customerId(c))
    .run();
  if (!result.meta.changes) return c.json({ error: "Equipment not found" }, 404);
  return c.json({ success: true });
});

// ----------------------------------------------------------- service records

const serviceRequestFields = [
  "equipment_id",
  "session_id",
  "type",
  "status",
  "priority",
  "description",
  "fault_codes",
  "assigned_mechanic",
  "estimated_cost",
  "diagnosis_result",
];

portalRoutes.get("/service-requests", async (c) =>
  c.json(await listForCustomer(c.env.DB, "service_requests", customerId(c))),
);

portalRoutes.post("/service-requests", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  return c.json(
    await createForCustomer(
      c.env.DB,
      "service_requests",
      customerId(c),
      pick(body, serviceRequestFields),
    ),
  );
});

async function updateServiceRequest(c: PortalContext) {
  const id = parseId(String(c.req.param("id")));
  if (!id) return c.json({ error: "Invalid service request id" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const updated = await updateOwned(
    c.env.DB,
    "service_requests",
    id,
    customerId(c),
    pick(body, serviceRequestFields),
  );
  if (!updated) return c.json({ error: "Service request not found" }, 404);
  return c.json(updated);
}

portalRoutes.patch("/service-requests/:id", updateServiceRequest);
portalRoutes.put("/service-requests/:id", updateServiceRequest);

portalRoutes.get("/work-orders", async (c) =>
  c.json(await listForCustomer(c.env.DB, "work_orders", customerId(c))),
);

// --------------------------------------------------------------- maintenance

const maintenanceFields = [
  "equipment_id",
  "service_type",
  "interval_hours",
  "last_service_date",
  "next_service_date",
  "status",
  "notes",
];

portalRoutes.get("/maintenance", async (c) =>
  c.json(await listForCustomer(c.env.DB, "maintenance_schedules", customerId(c))),
);

portalRoutes.post("/maintenance", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  return c.json(
    await createForCustomer(
      c.env.DB,
      "maintenance_schedules",
      customerId(c),
      pick(body, maintenanceFields),
    ),
  );
});

// ---------------------------------------------------------- support/documents

const supportFields = ["subject", "description", "status", "priority", "category"];

portalRoutes.get("/support-tickets", async (c) =>
  c.json(await listForCustomer(c.env.DB, "support_tickets", customerId(c))),
);

portalRoutes.post("/support-tickets", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  if (!body.subject) return c.json({ error: "Subject is required" }, 400);
  return c.json(
    await createForCustomer(c.env.DB, "support_tickets", customerId(c), pick(body, supportFields)),
  );
});

portalRoutes.get("/documents", async (c) =>
  c.json(await listForCustomer(c.env.DB, "documents", customerId(c))),
);

portalRoutes.get("/invoices", async (c) =>
  c.json(await listForCustomer(c.env.DB, "invoices", customerId(c))),
);

portalRoutes.patch("/profile", async (c) => {
  const cid = customerId(c);
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  await updateRowById(c.env.DB, "customers", cid, pick(body, [
    "first_name",
    "last_name",
    "company",
    "phone",
  ]));
  const row = await getById<DbRow>(c.env.DB, "customers", cid);
  if (!row) return c.json({ error: "Customer not found" }, 404);
  return c.json(publicCustomer(row));
});

portalRoutes.post("/escalation", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const ticket = await createForCustomer(c.env.DB, "support_tickets", customerId(c), {
    subject: body.subject || "Escalation to Human Expert",
    description: body.description || "",
    priority: body.priority || "high",
    category: "escalation",
    status: "open",
  });
  return c.json(ticket);
});

// -------------------------------------------------------------------- parts

const SERIAL_PREFIX_MAP: Record<string, { make: string; type: string; models: string[] }> = {
  CAT: { make: "CAT", type: "Excavator", models: ["320F", "330F", "336F", "349F"] },
  "7WJ": { make: "CAT", type: "Loader", models: ["966F", "966G", "966H"] },
  "5YW": { make: "CAT", type: "Excavator", models: ["320C", "320D", "320E"] },
  BFM: { make: "CAT", type: "Excavator", models: ["336E", "336F"] },
  JJG: { make: "CAT", type: "Excavator", models: ["349E", "349F"] },
  MBH: { make: "CAT", type: "Dozer", models: ["D6T", "D6R"] },
  TMC: { make: "CAT", type: "Dozer", models: ["D8T", "D8R"] },
  HEX: { make: "CAT", type: "Excavator", models: ["320", "325", "330"] },
  KOM: { make: "Komatsu", type: "Excavator", models: ["PC200-8", "PC210-10", "PC360"] },
  PC2: { make: "Komatsu", type: "Excavator", models: ["PC200-8", "PC200-10"] },
  PC3: { make: "Komatsu", type: "Excavator", models: ["PC300-8", "PC350-10"] },
  WA3: { make: "Komatsu", type: "Loader", models: ["WA320", "WA380"] },
  D37: { make: "Komatsu", type: "Dozer", models: ["D37EX", "D37PX"] },
  JD: { make: "John Deere", type: "Excavator", models: ["210G", "350G", "470G"] },
  DER: { make: "John Deere", type: "Loader", models: ["544K", "644K", "744K"] },
  "1DW": { make: "John Deere", type: "Excavator", models: ["200D", "210G"] },
  "1FF": { make: "John Deere", type: "Excavator", models: ["350G", "380G"] },
};

function partResponse(row: DbRow, compatibilityOverride?: string): DbRow {
  return {
    partNumber: row.part_number,
    name: row.description,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    price: row.price ?? (row.price_usd ? `$${row.price_usd}` : null),
    imageUrl: row.image_url,
    compatibility: compatibilityOverride ?? row.compatibility ?? row.model_compat,
  };
}

portalRoutes.get("/parts", async (c) => {
  const q = (new URL(c.req.url).searchParams.get("serial") ?? "").trim();
  if (q.length < 2) return c.json([]);
  const upperQ = q.toUpperCase();
  const prefix = Object.entries(SERIAL_PREFIX_MAP).find(([key]) => upperQ.startsWith(key))?.[1];
  if (prefix) {
    const clauses = prefix.models
      .map((_, i) =>
        `(compatibility LIKE ?${i * 4 + 1} COLLATE NOCASE OR equipment LIKE ?${i * 4 + 2} COLLATE NOCASE OR engine_model LIKE ?${i * 4 + 3} COLLATE NOCASE OR model_compat LIKE ?${i * 4 + 4} COLLATE NOCASE)`,
      )
      .join(" OR ");
    const binds = prefix.models.flatMap((model) => {
      const pattern = likePattern(model);
      return [pattern, pattern, pattern, pattern];
    });
    const rows = await selectAll<DbRow>(
      c.env.DB,
      `SELECT * FROM parts WHERE ${clauses} LIMIT 200`,
      ...binds,
    );
    const note = `Compatible with ${prefix.make} ${prefix.type} - ${prefix.models.join(", ")}`;
    return c.json(rows.map((row) => partResponse(row, note)));
  }

  const pattern = likePattern(q);
  const rows = await selectAll<DbRow>(
    c.env.DB,
    `SELECT * FROM parts
      WHERE part_number LIKE ?1 COLLATE NOCASE
         OR description LIKE ?1 COLLATE NOCASE
         OR category LIKE ?1 COLLATE NOCASE
         OR subcategory LIKE ?1 COLLATE NOCASE
         OR compatibility LIKE ?1 COLLATE NOCASE
         OR engine_model LIKE ?1 COLLATE NOCASE
         OR gasket LIKE ?1 COLLATE NOCASE
         OR equipment LIKE ?1 COLLATE NOCASE
         OR model_compat LIKE ?1 COLLATE NOCASE
      LIMIT 200`,
    pattern,
  );
  return c.json(rows.map((row) => partResponse(row)));
});

portalRoutes.get("/parts/validate", async (c) => {
  const partNumber = (new URL(c.req.url).searchParams.get("partNumber") ?? "").trim();
  if (!partNumber) return c.json({ valid: false, error: "Part number is required" });
  const normalized = partNumber.toUpperCase().replace(/\s+/g, "");
  const row = await selectOne<DbRow>(
    c.env.DB,
    `SELECT * FROM parts
      WHERE upper(replace(part_number, ' ', '')) = ?1
      ORDER BY (source_file IS NULL) DESC
      LIMIT 1`,
    normalized,
  );
  if (row) {
    return c.json({
      valid: true,
      partNumber: row.part_number,
      name: row.description,
      description: row.description,
      category: row.category,
      price: row.price ?? (row.price_usd ? `$${row.price_usd}` : null),
    });
  }
  if (/^[A-Za-z0-9\-./\s]{2,50}$/.test(partNumber)) {
    return c.json({
      valid: true,
      partNumber,
      name: null,
      description: null,
      category: null,
      price: null,
      note: "Part number format is valid but not found in our catalog. Our team will verify availability.",
    });
  }
  return c.json({ valid: false, error: "Invalid part number format" });
});

// --------------------------------------------------------------- quote flow

portalRoutes.post("/quote-requests", async (c) => {
  const cid = customerId(c);
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const items = Array.isArray(body.items) ? (body.items as DbRow[]) : [];
  if (items.length === 0) return c.json({ error: "At least one part item is required" }, 400);

  const validationResults: Array<DbRow & {
    partNumber: string;
    quantity: number;
    valid: boolean;
    errors: string[];
  }> = items.map((item) => {
    const errors: string[] = [];
    const partNumber = String(item.partNumber ?? item.part_number ?? "").trim();
    const quantity = Number(item.quantity ?? 1);
    if (partNumber.length < 2) errors.push("Part number is required (min 2 characters)");
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 9999) {
      errors.push("Quantity must be between 1 and 9999");
    }
    if (partNumber && !/^[A-Za-z0-9\-./\s]{2,50}$/.test(partNumber)) {
      errors.push("Part number contains invalid characters");
    }
    return { ...item, partNumber, quantity, valid: errors.length === 0, errors };
  });
  const validCount = validationResults.filter((item) => item.valid).length;
  const invalidCount = validationResults.length - validCount;
  if (validCount === 0) return c.json({ error: "No valid parts in the list", validationResults }, 400);

  const refNumber =
    `QR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const quoteId = await insertRow(c.env.DB, "quote_requests", {
    customer_id: cid,
    equipment_id: numberOrNull(body.equipmentId ?? body.equipment_id),
    reference_number: refNumber,
    status: "pending_review",
    notes: nullIfBlank(body.notes),
    equipment_info: nullIfBlank(body.equipmentInfo ?? body.equipment_info),
    total_items: items.length,
    validated_items: validCount,
    invalid_items: invalidCount,
  });
  const createdItems: DbRow[] = [];
  for (const item of validationResults) {
    const itemId = await insertRow(c.env.DB, "quote_request_items", {
      quote_request_id: quoteId,
      part_number: item.partNumber,
      description: nullIfBlank(item.description),
      quantity: item.quantity,
      make: nullIfBlank(item.make),
      model: nullIfBlank(item.model),
      serial_number: nullIfBlank(item.serialNumber ?? item.serial_number),
      urgency: nullIfBlank(item.urgency) ?? "standard",
      validation_status: item.valid ? "validated" : "invalid",
      validation_notes: item.valid ? null : item.errors.join("; "),
    });
    const row = await getById<DbRow>(c.env.DB, "quote_request_items", itemId);
    createdItems.push(camelizeRow(row) ?? {});
  }
  const quote = camelizeRow(await getById<DbRow>(c.env.DB, "quote_requests", quoteId));
  return c.json({
    quoteRequest: quote,
    items: createdItems,
    validationSummary: { total: items.length, valid: validCount, invalid: invalidCount },
  });
});

portalRoutes.get("/quote-requests", async (c) =>
  c.json(await listForCustomer(c.env.DB, "quote_requests", customerId(c))),
);

portalRoutes.get("/quote-requests/:id", async (c) => {
  const id = parseId(String(c.req.param("id")));
  if (!id) return c.json({ error: "Invalid quote request id" }, 400);
  const quote = await selectOne<DbRow>(
    c.env.DB,
    "SELECT * FROM quote_requests WHERE id = ?1 AND customer_id = ?2",
    id,
    customerId(c),
  );
  if (!quote) return c.json({ error: "Quote request not found" }, 404);
  const items = await selectAll<DbRow>(
    c.env.DB,
    "SELECT * FROM quote_request_items WHERE quote_request_id = ?1 ORDER BY id",
    id,
  );
  return c.json({ ...(camelizeRow(quote) ?? {}), items: camelizeRows(items) });
});

// --------------------------------------------------------------- AI helpers

portalRoutes.get("/ai/sessions", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(new URL(c.req.url).searchParams.get("limit") ?? 50)));
  const rows = await selectAll<DbRow>(
    c.env.DB,
    `SELECT ds.*,
            EXISTS(SELECT 1 FROM diagnostic_results dr WHERE dr.session_id = ds.id) AS has_playbook
       FROM diagnostic_sessions ds
      WHERE ds.customer_id = ?1
      ORDER BY datetime(ds.started_at) DESC, ds.id DESC
      LIMIT ?2`,
    customerId(c),
    limit,
  );
  return c.json({
    sessions: rows.map((row) => ({
      id: row.id,
      status: row.status,
      machine_make: row.machine_make,
      machine_model: row.machine_model,
      started_at: row.started_at,
      completed_at: row.completed_at,
      has_playbook: Boolean(row.has_playbook),
    })),
  });
});

portalRoutes.get("/ai/escalations", async (c) => {
  const rows = await selectAll<DbRow>(
    c.env.DB,
    `SELECT * FROM escalations WHERE customer_id = ?1
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
               datetime(created_at) DESC
      LIMIT 100`,
    customerId(c),
  );
  return c.json({ escalations: camelizeRows(rows) });
});

portalRoutes.post("/ai/escalations", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const id = await insertRow(c.env.DB, "escalations", {
    customer_id: customerId(c),
    subject: String(body.subject ?? "Escalation to Human Expert"),
    description: nullIfBlank(body.description),
    equipment_info: nullIfBlank(body.equipment_info ?? body.equipmentInfo),
    priority: body.priority ?? "normal",
    status: "open",
  });
  const row = await getById<DbRow>(c.env.DB, "escalations", id);
  return c.json(camelizeRow(row), 201);
});

portalRoutes.get("/ai/escalations/:id", async (c) => {
  const id = parseId(String(c.req.param("id")));
  if (!id) return c.json({ error: "Invalid escalation id" }, 400);
  const row = await selectOne<DbRow>(
    c.env.DB,
    "SELECT * FROM escalations WHERE id = ?1 AND customer_id = ?2",
    id,
    customerId(c),
  );
  if (!row) return c.json({ error: "Escalation not found" }, 404);
  return c.json(camelizeRow(row));
});

portalRoutes.get("/cases", async (c) => {
  const rows = await selectAll<DbRow>(
    c.env.DB,
    `SELECT * FROM sessions WHERE customer_id = ?1
      ORDER BY datetime(created_at) DESC, id DESC LIMIT 100`,
    customerId(c),
  );
  return c.json(camelizeRows(rows));
});

portalRoutes.get("/fault-codes", async (c) => {
  const raw = (new URL(c.req.url).searchParams.get("code") ?? "").trim();
  if (raw.length < 2) return c.json({ error: "Enter a fault code" }, 400);
  const normalized = normalizeFaultCode(raw);
  const row = await selectOne<DbRow>(
    c.env.DB,
    `SELECT * FROM fault_codes
      WHERE upper(replace(code,' ','')) = upper(replace(?1,' ',''))
         OR code LIKE ?2
      ORDER BY length(code) ASC
      LIMIT 1`,
    normalized,
    `${normalized}%`,
  );
  if (!row) return c.json({ error: "Code not found", code: normalized }, 404);
  const tier = await effectiveTier(c.env.DB, String(customerId(c)));
  const paid = tier === "pro" || tier === "shop";
  return c.json({
    code: row.code,
    description: row.description,
    severity: row.severity,
    manufacturer: row.manufacturer ?? null,
    paid_fields_locked: !paid,
    likely_causes: paid ? row.likely_causes : undefined,
    repair_actions: paid ? row.repair_actions : undefined,
    upgrade_hint: paid ? undefined : "Upgrade to Pro or Shop to see causes and repair actions.",
  });
});

// ------------------------------------------------------------------ billing

portalRoutes.get("/billing/me", async (c) => {
  const cid = customerId(c);
  const sub = await selectOne<DbRow>(
    c.env.DB,
    "SELECT * FROM subscriptions WHERE customer_id = ?1",
    cid,
  );
  const tier = await effectiveTier(c.env.DB, String(cid));
  const usage = await selectOne<{ count: number }>(
    c.env.DB,
    `SELECT count FROM ai_rate_limits
      WHERE customer_id = ?1 AND scope = 'diagnosis-monthly'
      ORDER BY window_start DESC LIMIT 1`,
    cid,
  );
  const monthlyLimit = tier === "free" ? 3 : null;
  return c.json({
    customer_id: cid,
    effective_tier: tier,
    raw_tier: sub?.tier ?? null,
    status: sub?.status ?? null,
    current_period_end: sub?.current_period_end ?? null,
    past_due_since: sub?.past_due_since ?? null,
    stripe_customer_id: sub?.stripe_customer_id ?? null,
    has_stripe_customer: Boolean(sub?.stripe_customer_id),
    diagnosis_usage: {
      this_month: usage?.count ?? 0,
      limit: monthlyLimit,
      unlimited: monthlyLimit === null,
    },
    anthropic_rate_limit_per_hour: tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    live_avatar_included: tier !== "free",
    billing_provider: "stripe",
  });
});

portalRoutes.post("/billing/stripe/checkout-session", async (c) => {
  const cid = customerId(c);
  const body = (await c.req.json().catch(() => ({}))) as { target_tier?: string };
  const target = body.target_tier === "shop" ? "shop" : "pro";
  const customer = await getById<DbRow>(c.env.DB, "customers", cid);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  const origin = c.req.header("origin") || "https://www.fixmyiron.com";
  const result = await createCheckoutSession(c.env, {
    customer,
    targetTier: target,
    successUrl: `${origin}/portal?section=billing&checkout=success`,
    cancelUrl: `${origin}/portal?section=billing&checkout=cancel`,
  });
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 502 | 503);
  }
  return c.json({ url: result.url, id: result.id, target_tier: target }, 201);
});

portalRoutes.post("/billing/portal-session", async (c) => {
  const cid = customerId(c);
  const sub = await selectOne<{ stripe_customer_id: string | null }>(
    c.env.DB,
    "SELECT stripe_customer_id FROM subscriptions WHERE customer_id = ?1 LIMIT 1",
    cid,
  );
  if (!sub?.stripe_customer_id) {
    return c.json({ error: "No Stripe customer is linked to this account yet." }, 400);
  }
  const origin = c.req.header("origin") || "https://www.fixmyiron.com";
  const result = await createCustomerPortalSession(
    c.env,
    sub.stripe_customer_id,
    `${origin}/portal?section=billing`,
  );
  if ("error" in result) return c.json({ error: result.error }, result.status as 502);
  return c.json({ url: result.url }, 201);
});

portalRoutes.post("/billing/upgrade-intent", async (c) => {
  const cid = customerId(c);
  const body = (await c.req.json().catch(() => ({}))) as DbRow;
  const target = body.target_tier === "shop" ? "shop" : "pro";
  const customer = await getById<DbRow>(c.env.DB, "customers", cid);
  const description =
    `Customer ${customer?.first_name ?? ""} ${customer?.last_name ?? ""} <${customer?.email ?? ""}> requested upgrade to ${target}.` +
    `\n\nNotes: ${body.notes ?? "(none)"}`;
  const id = await insertRow(c.env.DB, "escalations", {
    customer_id: cid,
    subject: `Upgrade request - ${target.toUpperCase()}`,
    description,
    priority: "high",
    status: "open",
  });
  return c.json({
    escalation_id: id,
    target_tier: target,
    status: "open",
    message:
      "Your upgrade request has been received. An American Iron representative will contact you to complete payment and activate the plan.",
    created_at: new Date().toISOString(),
  }, 201);
});
