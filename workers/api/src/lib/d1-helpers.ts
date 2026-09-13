export type DbRow = Record<string, unknown>;

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function camelizeRow<T = DbRow>(row: DbRow | null | undefined): T | null {
  if (!row) return null;
  const out: DbRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[snakeToCamel(key)] = value;
  }
  return out as T;
}

export function camelizeRows<T = DbRow>(rows: DbRow[] | undefined): T[] {
  return (rows ?? []).map((row) => camelizeRow<T>(row) as T);
}

export function omitKeys<T extends DbRow>(row: T, keys: string[]): DbRow {
  const out: DbRow = { ...row };
  for (const key of keys) delete out[key];
  return out;
}

export function publicCustomer(row: DbRow): DbRow {
  return omitKeys(camelizeRow<DbRow>(row) ?? {}, ["passwordHash", "password_hash"]);
}

export function nullIfBlank(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value;
}

export function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function randomHex(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function selectOne<T = DbRow>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T | null> {
  return db.prepare(sql).bind(...bindings).first<T>();
}

export async function selectAll<T = DbRow>(
  db: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function insertRow(
  db: D1Database,
  table: string,
  data: DbRow,
): Promise<number> {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw new Error("insertRow requires data");
  const columns = entries.map(([key]) => `"${key}"`).join(", ");
  const placeholders = entries.map((_, index) => `?${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  const result = await db
    .prepare(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`)
    .bind(...values)
    .run();
  return Number(result.meta.last_row_id);
}

export async function updateRowById(
  db: D1Database,
  table: string,
  id: number,
  data: DbRow,
): Promise<boolean> {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return false;
  const sets = entries.map(([key], index) => `"${key}" = ?${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  const result = await db
    .prepare(`UPDATE "${table}" SET ${sets} WHERE id = ?${entries.length + 1}`)
    .bind(...values, id)
    .run();
  return Boolean(result.meta.changes);
}

export async function getById<T = DbRow>(
  db: D1Database,
  table: string,
  id: number | string,
): Promise<T | null> {
  return selectOne<T>(db, `SELECT * FROM "${table}" WHERE id = ?1`, id);
}

export async function tableColumns(db: D1Database, table: string): Promise<Set<string>> {
  const info = await db.prepare(`PRAGMA table_info("${table}")`).all<{ name: string }>();
  return new Set((info.results ?? []).map((column) => column.name));
}

async function authSessionStorageKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`auth-session:${token}`),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createAuthSession(
  db: D1Database,
  customerId: number,
  ttlMs = 30 * 24 * 60 * 60 * 1000,
): Promise<string> {
  const token = randomHex(32);
  const storageKey = await authSessionStorageKey(token);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await db
    .prepare(
      "INSERT INTO auth_sessions (token, customer_id, expires_at) VALUES (?1, ?2, ?3)",
    )
    .bind(storageKey, customerId, expiresAt)
    .run();
  return token;
}

export async function getCustomerByAuthToken(
  db: D1Database,
  token: string | null | undefined,
): Promise<DbRow | null> {
  if (!token) return null;
  const hashed = await authSessionStorageKey(token);
  for (const candidate of hashed === token ? [token] : [hashed, token]) {
    const row = await selectOne<DbRow>(
      db,
      `SELECT c.*
         FROM auth_sessions s
         JOIN customers c ON c.id = s.customer_id
        WHERE s.token = ?1
          AND c.status = 'active'
        LIMIT 1`,
      candidate,
    );
    if (!row) continue;
    const session = await selectOne<{ expires_at: string }>(
      db,
      "SELECT expires_at FROM auth_sessions WHERE token = ?1",
      candidate,
    );
    if (
      session &&
      new Date(session.expires_at).getTime() > Date.now()
    ) {
      return row;
    }
    await db
      .prepare("DELETE FROM auth_sessions WHERE token = ?1")
      .bind(candidate)
      .run();
    return null;
  }
  await db
    .prepare("DELETE FROM auth_sessions WHERE token = ?1 OR token = ?2")
    .bind(hashed, token)
    .run();
  return null;
}

export async function deleteAuthSession(
  db: D1Database,
  token: string,
): Promise<void> {
  const hashed = await authSessionStorageKey(token);
  await db
    .prepare("DELETE FROM auth_sessions WHERE token = ?1 OR token = ?2")
    .bind(hashed, token)
    .run();
}
