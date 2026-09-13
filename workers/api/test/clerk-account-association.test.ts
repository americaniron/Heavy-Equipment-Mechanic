import { describe, expect, it } from "vitest";
import {
  AccountAssociationConflict,
  syncClerkUserToCustomer,
} from "../src/lib/clerk-identity";

function customerDb(initial: Array<Record<string, unknown>>) {
  const rows = initial.map((row) => ({ ...row }));
  return {
    rows,
    database: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            args = values;
            return statement;
          },
          async first<T>() {
            if (/WHERE clerk_user_id = \?1/.test(sql)) {
              return (
                rows.find((row) => row.clerk_user_id === args[0]) ?? null
              ) as T | null;
            }
            if (/WHERE lower\(email\) = lower\(\?1\)/.test(sql)) {
              return (
                rows.find(
                  (row) =>
                    String(row.email).toLowerCase() ===
                    String(args[0]).toLowerCase(),
                ) ?? null
              ) as T | null;
            }
            if (/WHERE id = \?1/.test(sql)) {
              return (
                rows.find((row) => Number(row.id) === Number(args[0])) ??
                null
              ) as T | null;
            }
            return null;
          },
          async run() {
            if (/UPDATE customers\s+SET email = \?2/.test(sql)) {
              const row = rows.find(
                (candidate) => candidate.clerk_user_id === args[0],
              );
              if (row) {
                row.email = args[1];
                if (args[2]) row.first_name = args[2];
                if (args[3]) row.last_name = args[3];
              }
              return {
                success: true,
                meta: { changes: row ? 1 : 0, last_row_id: 0 },
              };
            }
            if (/SET clerk_user_id = \?2/.test(sql)) {
              const row = rows.find(
                (candidate) => Number(candidate.id) === Number(args[0]),
              );
              if (row) row.clerk_user_id = args[1];
              return {
                success: true,
                meta: { changes: row ? 1 : 0, last_row_id: 0 },
              };
            }
            return {
              success: true,
              meta: { changes: 0, last_row_id: 0 },
            };
          },
        };
        return statement;
      },
    } as unknown as D1Database,
  };
}

describe("Clerk account association", () => {
  it("updates a linked customer's canonical email", async () => {
    const memory = customerDb([
      {
        id: 1,
        email: "old@fixmyiron.test",
        status: "active",
        clerk_user_id: "user_1",
      },
    ]);
    const updated = await syncClerkUserToCustomer(
      { DB: memory.database } as any,
      {
        clerkUserId: "user_1",
        email: "new@fixmyiron.test",
        firstName: "New",
        lastName: "Name",
        emailVerified: true,
      },
    );

    expect(updated.email).toBe("new@fixmyiron.test");
    expect(memory.rows[0]).toMatchObject({
      email: "new@fixmyiron.test",
      first_name: "New",
      last_name: "Name",
    });
  });

  it("rejects an email already owned by another local account", async () => {
    const memory = customerDb([
      {
        id: 1,
        email: "one@fixmyiron.test",
        status: "active",
        clerk_user_id: "user_1",
      },
      {
        id: 2,
        email: "two@fixmyiron.test",
        status: "active",
        clerk_user_id: "user_2",
      },
    ]);

    await expect(
      syncClerkUserToCustomer(
        { DB: memory.database } as any,
        {
          clerkUserId: "user_1",
          email: "two@fixmyiron.test",
          emailVerified: true,
        },
      ),
    ).rejects.toBeInstanceOf(AccountAssociationConflict);
  });

  it("never re-associates a deleted local account by email", async () => {
    const memory = customerDb([
      {
        id: 3,
        email: "deleted@fixmyiron.test",
        status: "deleted",
        clerk_user_id: null,
      },
    ]);

    await expect(
      syncClerkUserToCustomer(
        { DB: memory.database } as any,
        {
          clerkUserId: "user_recreated",
          email: "deleted@fixmyiron.test",
          emailVerified: true,
        },
      ),
    ).rejects.toBeInstanceOf(AccountAssociationConflict);
    expect(memory.rows[0]?.clerk_user_id).toBeNull();
  });
});
