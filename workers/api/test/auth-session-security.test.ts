import { describe, expect, it } from "vitest";
import {
  createAuthSession,
  deleteAuthSession,
  getCustomerByAuthToken,
} from "../src/lib/d1-helpers";

function authDb(status = "active") {
  const sessions = new Map<
    string,
    { customerId: number; expiresAt: string }
  >();
  const customer = {
    id: 7,
    email: "owner@fixmyiron.test",
    status,
  };
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first<T>() {
          if (/FROM auth_sessions s\s+JOIN customers c/i.test(sql)) {
            const session = sessions.get(String(args[0]));
            return (
              session &&
              session.customerId === customer.id &&
              customer.status === "active"
                ? customer
                : null
            ) as T | null;
          }
          if (/SELECT expires_at FROM auth_sessions/.test(sql)) {
            const session = sessions.get(String(args[0]));
            return (
              session ? { expires_at: session.expiresAt } : null
            ) as T | null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO auth_sessions/.test(sql)) {
            sessions.set(String(args[0]), {
              customerId: Number(args[1]),
              expiresAt: String(args[2]),
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (/DELETE FROM auth_sessions/.test(sql)) {
            let changes = 0;
            for (const candidate of args) {
              if (sessions.delete(String(candidate))) changes += 1;
            }
            return { success: true, meta: { changes } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, sessions };
}

describe("native auth session storage", () => {
  it("stores only a hash while returning a usable opaque token", async () => {
    const memory = authDb();
    const token = await createAuthSession(memory.db, 7);
    const [storedKey] = [...memory.sessions.keys()];

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(storedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(storedKey).not.toBe(token);
    expect(await getCustomerByAuthToken(memory.db, token)).toMatchObject({
      id: 7,
    });

    await deleteAuthSession(memory.db, token);
    expect(memory.sessions.size).toBe(0);
  });

  it("rejects and removes expired sessions", async () => {
    const memory = authDb();
    const token = await createAuthSession(memory.db, 7, -1);

    expect(await getCustomerByAuthToken(memory.db, token)).toBeNull();
    expect(memory.sessions.size).toBe(0);
  });

  it("rejects and removes sessions after the customer is disabled", async () => {
    const memory = authDb("deleted");
    const token = await createAuthSession(memory.db, 7);

    expect(await getCustomerByAuthToken(memory.db, token)).toBeNull();
    expect(memory.sessions.size).toBe(0);
  });
});
