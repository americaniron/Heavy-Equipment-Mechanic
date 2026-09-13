import { selectOne, type DbRow } from "./d1-helpers";
import type { Tier } from "../env";

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

async function columns(db: D1Database, table: string): Promise<ColumnInfo[]> {
  const result = await db
    .prepare(`PRAGMA table_info("${table}")`)
    .all<ColumnInfo>();
  return result.results ?? [];
}

function numericTextId(): string {
  const random = crypto.getRandomValues(new Uint32Array(1))[0]! % 10_000;
  return String(Math.floor(Date.now() / 1000) * 10_000 + random);
}

const ownershipBackfills = new WeakMap<object, Set<number>>();

/**
 * Production was originally provisioned from the Clerk-first schema where
 * `users.clerk_user_id` owns equipment/diagnoses. New routes use numeric
 * `customers.id`. Resolve or create the bridge key without rebuilding live
 * tables or running a destructive migration.
 */
export async function legacyUserKeyForCustomer(
  db: D1Database,
  customerId: number,
): Promise<string> {
  const customer = await selectOne<{
    email: string;
    clerk_user_id: string | null;
  }>(
    db,
    "SELECT email, clerk_user_id FROM customers WHERE id = ?1",
    customerId,
  );
  if (!customer) throw new Error("customer_not_found");
  const preferred = customer.clerk_user_id || `customer:${customerId}`;
  try {
    const existing = await selectOne<{ clerk_user_id: string }>(
      db,
      "SELECT clerk_user_id FROM users WHERE lower(email) = lower(?1) LIMIT 1",
      customer.email,
    );
    if (existing?.clerk_user_id) return existing.clerk_user_id;
    await db
      .prepare(
        `INSERT OR IGNORE INTO users
           (clerk_user_id, email, tier, created_at, updated_at)
         VALUES (?1, ?2, 'free', unixepoch(), unixepoch())`,
      )
      .bind(preferred, customer.email)
      .run();
  } catch {
    // Newer databases may omit the compatibility table entirely.
  }
  return preferred;
}

/**
 * Attach customer-centric ownership to rows created by the original
 * Clerk-keyed Worker schema. The compatibility columns are additive, and the
 * update never changes the legacy user_id or transfers an already-owned row.
 */
export async function backfillLegacyOwnership(
  db: D1Database,
  customerId: number,
): Promise<void> {
  const dbKey = db as unknown as object;
  const completed = ownershipBackfills.get(dbKey) ?? new Set<number>();
  if (completed.has(customerId)) return;
  const userKey = await legacyUserKeyForCustomer(db, customerId);
  for (const table of ["equipment", "diagnostic_sessions"] as const) {
    await db
      .prepare(
        `UPDATE "${table}"
            SET customer_id = ?1
          WHERE customer_id IS NULL AND user_id = ?2`,
      )
      .bind(customerId, userKey)
      .run();
  }
  completed.add(customerId);
  ownershipBackfills.set(dbKey, completed);
}

async function insertKnownColumns(
  db: D1Database,
  table: string,
  infos: ColumnInfo[],
  data: DbRow,
): Promise<D1Result> {
  const allowed = new Set(infos.map((column) => column.name));
  const entries = Object.entries(data).filter(
    ([name, value]) => allowed.has(name) && value !== undefined,
  );
  if (entries.length === 0) throw new Error(`${table}_insert_has_no_columns`);
  const names = entries.map(([name]) => `"${name}"`).join(", ");
  const values = entries.map((_, index) => `?${index + 1}`).join(", ");
  return db
    .prepare(`INSERT INTO "${table}" (${names}) VALUES (${values})`)
    .bind(...entries.map(([, value]) => value))
    .run();
}

export async function insertEquipmentCompat(
  db: D1Database,
  customerId: number,
  data: DbRow,
): Promise<string | number> {
  const infos = await columns(db, "equipment");
  const idInfo = infos.find((column) => column.name === "id");
  const explicitId =
    idInfo?.pk && /TEXT/i.test(idInfo.type) ? numericTextId() : undefined;
  const userKey = infos.some((column) => column.name === "user_id")
    ? await legacyUserKeyForCustomer(db, customerId)
    : undefined;
  const payload: DbRow = {
    ...data,
    ...(explicitId ? { id: explicitId } : {}),
    customer_id: customerId,
    user_id: userKey,
    serial: data.serial_number,
    hours: data.smu_hours,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };
  const result = await insertKnownColumns(
    db,
    "equipment",
    infos,
    payload,
  );
  return explicitId ?? Number(result.meta.last_row_id);
}

export async function insertDiagnosticSessionCompat(
  db: D1Database,
  customerId: number,
  tier: Tier,
  data: DbRow,
): Promise<string> {
  const infos = await columns(db, "diagnostic_sessions");
  const idInfo = infos.find((column) => column.name === "id");
  const explicitId =
    idInfo?.pk && /TEXT/i.test(idInfo.type) ? numericTextId() : undefined;
  const userKey = infos.some((column) => column.name === "user_id")
    ? await legacyUserKeyForCustomer(db, customerId)
    : undefined;
  const now = Math.floor(Date.now() / 1000);
  const payload: DbRow = {
    ...data,
    ...(explicitId ? { id: explicitId } : {}),
    customer_id: customerId,
    user_id: userKey,
    tier_at_creation: tier,
    created_at: now,
    updated_at: now,
    started_at: new Date().toISOString(),
  };
  const result = await insertKnownColumns(
    db,
    "diagnostic_sessions",
    infos,
    payload,
  );
  return explicitId ?? String(result.meta.last_row_id);
}

export async function equipmentOwnedByCustomer(
  db: D1Database,
  id: string | number,
  customerId: number,
): Promise<boolean> {
  await backfillLegacyOwnership(db, customerId);
  const row = await selectOne<{
    customer_id: number | null;
    user_id: string | null;
  }>(
    db,
    "SELECT customer_id, user_id FROM equipment WHERE id = ?1",
    id,
  );
  if (!row) return false;
  if (row.customer_id != null && Number(row.customer_id) === customerId) {
    return true;
  }
  if (row.customer_id == null && row.user_id) {
    const userKey = await legacyUserKeyForCustomer(db, customerId);
    return String(row.user_id) === userKey;
  }
  return false;
}

export async function updateOwnedEquipment(
  db: D1Database,
  id: string | number,
  customerId: number,
  data: DbRow,
): Promise<boolean> {
  if (!(await equipmentOwnedByCustomer(db, id, customerId))) return false;
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return false;
  const sets = entries.map(([key], index) => `"${key}" = ?${index + 1}`).join(", ");
  const result = await db
    .prepare(`UPDATE equipment SET ${sets} WHERE id = ?${entries.length + 1}`)
    .bind(...entries.map(([, value]) => value), id)
    .run();
  return Boolean(result.meta.changes);
}

export async function deleteOwnedEquipment(
  db: D1Database,
  id: string | number,
  customerId: number,
): Promise<boolean> {
  if (!(await equipmentOwnedByCustomer(db, id, customerId))) return false;
  const result = await db
    .prepare("DELETE FROM equipment WHERE id = ?1")
    .bind(id)
    .run();
  return Boolean(result.meta.changes);
}
