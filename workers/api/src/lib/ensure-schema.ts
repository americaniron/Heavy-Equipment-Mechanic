import { log } from "./log";
import { OPERATIONAL_DDL } from "./operational-ddl";

interface ColumnSpec {
  table: string;
  column: string;
  ddl: string;
}

const COLUMNS: ColumnSpec[] = [
  { table: "customers", column: "clerk_user_id", ddl: "TEXT" },
  { table: "customers", column: "email_verified_at", ddl: "TEXT" },
  { table: "customers", column: "updated_at", ddl: "TEXT" },
  { table: "subscriptions", column: "customer_id", ddl: "INTEGER" },
  { table: "subscriptions", column: "clerk_user_id", ddl: "TEXT" },
  { table: "subscriptions", column: "stripe_customer_id", ddl: "TEXT" },
  { table: "subscriptions", column: "stripe_subscription_id", ddl: "TEXT" },
  { table: "subscriptions", column: "stripe_price_id", ddl: "TEXT" },
  { table: "subscriptions", column: "stripe_status", ddl: "TEXT" },
  { table: "equipment", column: "customer_id", ddl: "INTEGER" },
  { table: "equipment", column: "name", ddl: "TEXT" },
  { table: "equipment", column: "type", ddl: "TEXT" },
  { table: "equipment", column: "serial_number", ddl: "TEXT" },
  { table: "equipment", column: "smu_hours", ddl: "TEXT" },
  { table: "equipment", column: "notes", ddl: "TEXT" },
  { table: "equipment", column: "status", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "customer_id", ddl: "INTEGER" },
  { table: "diagnostic_sessions", column: "machine_make", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "machine_model", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "machine_year", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "machine_hours", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "symptoms", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "fault_codes_input", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "recent_service", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "operator_notes", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "model_used", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "started_at", ddl: "TEXT" },
  { table: "diagnostic_sessions", column: "completed_at", ddl: "TEXT" },
  { table: "parts", column: "subcategory", ddl: "TEXT" },
  { table: "parts", column: "compatibility", ddl: "TEXT" },
  { table: "parts", column: "model_compat", ddl: "TEXT" },
  { table: "parts", column: "engine_model", ddl: "TEXT" },
  { table: "parts", column: "equipment", ddl: "TEXT" },
  { table: "parts", column: "gasket", ddl: "TEXT" },
  { table: "parts", column: "price", ddl: "TEXT" },
  { table: "parts", column: "image_url", ddl: "TEXT" },
  { table: "fault_codes", column: "likely_causes", ddl: "TEXT" },
  { table: "fault_codes", column: "repair_actions", ddl: "TEXT" },
  { table: "fault_codes", column: "manufacturer", ddl: "TEXT" },
  { table: "fault_codes", column: "spn", ddl: "TEXT" },
  { table: "fault_codes", column: "fmi", ddl: "TEXT" },
  { table: "fault_codes", column: "provenance", ddl: "TEXT" },
  { table: "sessions", column: "customer_id", ddl: "INTEGER" },
  { table: "sessions", column: "access_token", ddl: "TEXT" },
  { table: "sessions", column: "language", ddl: "TEXT" },
  { table: "sessions", column: "consent_given", ddl: "INTEGER" },
  { table: "sessions", column: "agent_provider", ddl: "TEXT" },
  { table: "sessions", column: "mechanic_type", ddl: "TEXT" },
  { table: "sessions", column: "status", ddl: "TEXT" },
  { table: "sessions", column: "customer_name", ddl: "TEXT" },
  { table: "sessions", column: "customer_email", ddl: "TEXT" },
];

export function splitSqlStatements(sql: string): string[] {
  const stripped = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const statements: string[] = [];
  let buffer = "";
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      const statement = buffer.trim();
      if (statement) statements.push(statement);
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  const last = buffer.trim();
  if (last) statements.push(last);
  return statements.filter((statement) => !/^PRAGMA\b/i.test(statement));
}

let ensured = false;
let ensuring: Promise<void> | null = null;

export async function ensureOperationalSchema(db: D1Database): Promise<void> {
  if (ensured) return;
  if (ensuring) return ensuring;
  ensuring = (async () => {
    for (const statement of splitSqlStatements(OPERATIONAL_DDL)) {
      try {
        await db.prepare(statement).run();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(message)) {
          log.warn("schema_create_skipped", { err: message, sql: statement.slice(0, 80) });
        }
      }
    }
    for (const spec of COLUMNS) {
      try {
        const info = await db
          .prepare(`PRAGMA table_info("${spec.table}")`)
          .all<{ name: string }>();
        const cols = info.results ?? [];
        if (cols.length === 0) continue;
        if (cols.some((c) => c.name === spec.column)) continue;
        await db
          .prepare(`ALTER TABLE "${spec.table}" ADD COLUMN "${spec.column}" ${spec.ddl}`)
          .run();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate column/i.test(message)) {
          log.warn("schema_alter_skipped", {
            table: spec.table,
            column: spec.column,
            err: message,
          });
        }
      }
    }
    ensured = true;
  })();
  await ensuring;
}
