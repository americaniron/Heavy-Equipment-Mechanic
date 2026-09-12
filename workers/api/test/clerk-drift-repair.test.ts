import { describe, expect, it, vi } from "vitest";

// Control the Clerk client so we can drive both createUser outcomes.
const createUserMock = vi.fn();
vi.mock("../src/lib/clerk-auth", () => ({
  getClerkClient: () => ({
    users: {
      createUser: createUserMock,
      getUserList: async () => ({ data: [] }),
    },
  }),
  verifyClerkJwt: async () => null,
}));

import { authenticateCustomer } from "../src/lib/clerk-identity";
import { hashPassword } from "../src/lib/password";
import { log } from "../src/lib/log";

function makeDb(customerRow: Record<string, unknown>, captured: { update?: unknown[] }) {
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async all() {
          return { results: [] };
        },
        async first() {
          if (sql.includes("SELECT 1")) return { ok: 1 };
          if (sql.includes("FROM customers WHERE lower(email)")) return customerRow;
          return null;
        },
        async run() {
          if (sql.startsWith("UPDATE customers SET clerk_user_id")) {
            captured.update = bound;
          }
          return { success: true, meta: { last_row_id: 1, changes: 1 } };
        },
      };
      return stmt;
    },
  } as any;
}

function baseEnv(db: any) {
  return {
    DB: db,
    CLERK_SECRET_KEY: "sk_test_dummy",
    ANTHROPIC_API_KEY: "",
  } as any;
}

describe("Clerk drift self-heal on login (FIX D repair)", () => {
  it("re-links a drifted customer when Clerk user creation succeeds", async () => {
    createUserMock.mockResolvedValueOnce({ id: "user_healed_1" });
    const infoSpy = vi.spyOn(log, "info");
    const captured: { update?: unknown[] } = {};

    const customerRow = {
      id: 7,
      email: "healme@fixmyiron.test",
      first_name: "Heal",
      last_name: "Me",
      status: "active",
      clerk_user_id: null,
      password_hash: await hashPassword("Password123"),
    };

    const result = await authenticateCustomer(
      baseEnv(makeDb(customerRow, captured)),
      "healme@fixmyiron.test",
      "Password123",
    );

    expect("customer" in result).toBe(true);
    if (!("customer" in result)) throw new Error("expected success");
    expect(result.customer.clerk_user_id).toBe("user_healed_1");
    // Linkage was persisted: id bound first, new clerk id second.
    expect(captured.update).toEqual([7, "user_healed_1"]);
    const infoMsgs = infoSpy.mock.calls.map((c) => c[0]);
    expect(infoMsgs).toContain("clerk_link_repaired_on_login");
    infoSpy.mockRestore();
  });

  it("still logs the user in (no linkage) when the repair itself fails", async () => {
    createUserMock.mockRejectedValueOnce(new Error("Clerk still down: 503"));
    const captured: { update?: unknown[] } = {};

    const customerRow = {
      id: 8,
      email: "stilldrift@fixmyiron.test",
      first_name: "Still",
      last_name: "Drift",
      status: "active",
      clerk_user_id: null,
      password_hash: await hashPassword("Password123"),
    };

    const result = await authenticateCustomer(
      baseEnv(makeDb(customerRow, captured)),
      "stilldrift@fixmyiron.test",
      "Password123",
    );

    expect("customer" in result).toBe(true);
    if (!("customer" in result)) throw new Error("expected success");
    // Login succeeds; linkage remains null (drift persists, but observable).
    expect(result.customer.clerk_user_id).toBeNull();
    expect(captured.update).toBeUndefined();
    expect(result.token).toBeTruthy();
  });
});
