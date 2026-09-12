import { describe, expect, it } from "vitest";
import { OPERATIONAL_DDL } from "../src/lib/operational-ddl";
import { splitSqlStatements } from "../src/lib/ensure-schema";

describe("operational schema DDL", () => {
  it("splits additive CREATE TABLE statements without DROP", () => {
    const statements = splitSqlStatements(OPERATIONAL_DDL);
    expect(statements.some((sql) => /CREATE TABLE IF NOT EXISTS sessions\b/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /CREATE TABLE IF NOT EXISTS session_messages\b/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /CREATE TABLE IF NOT EXISTS auth_sessions\b/i.test(sql))).toBe(true);
    expect(statements.every((sql) => !/\bDROP\b/i.test(sql))).toBe(true);
    expect(statements.every((sql) => !/\bTRUNCATE\b/i.test(sql))).toBe(true);
  });
});
