import { describe, expect, it } from "vitest";
import {
  claimWebhook,
  completeWebhook,
  releaseWebhook,
} from "../src/lib/webhook-idempotency";

interface Row {
  id: string;
  source: string;
  status: string;
  claimedAt: number;
  claimToken: string;
  attempts: number;
}

function memoryDb() {
  const rows = new Map<string, Row>();
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first<T>() {
          if (/SELECT id FROM processed_webhooks/.test(sql)) {
            const row = rows.get(String(args[0]));
            return (
              row && row.source === args[1] ? { id: row.id } : null
            ) as T | null;
          }
          if (/SELECT status, claimed_at FROM processed_webhooks/.test(sql)) {
            const row = rows.get(String(args[0]));
            return (
              row && row.source === args[1]
                ? {
                    status: row.status,
                    claimed_at: new Date(row.claimedAt).toISOString(),
                  }
                : null
            ) as T | null;
          }
          return null;
        },
        async run() {
          const id = String(args[0]);
          if (/INSERT OR IGNORE INTO processed_webhooks/.test(sql)) {
            if (rows.has(id)) {
              return { success: true, meta: { changes: 0 } };
            }
            rows.set(id, {
              id,
              source: String(args[1]),
              status: "processing",
              claimedAt: Date.now(),
              claimToken: String(args[2]),
              attempts: 1,
            });
            return { success: true, meta: { changes: 1 } };
          }
          const row = rows.get(id);
          if (
            /attempt_count = COALESCE/.test(sql) &&
            row &&
            row.source === args[1] &&
            row.status === "processing" &&
            row.claimedAt <= Date.now() - 10 * 60 * 1000
          ) {
            row.claimedAt = Date.now();
            row.claimToken = String(args[2]);
            row.attempts += 1;
            return { success: true, meta: { changes: 1 } };
          }
          if (
            /SET status = 'processed'/.test(sql) &&
            row &&
            row.source === args[1] &&
            row.status === "processing" &&
            row.claimToken === args[2]
          ) {
            row.status = "processed";
            return { success: true, meta: { changes: 1 } };
          }
          if (
            /DELETE FROM processed_webhooks/.test(sql) &&
            row &&
            row.source === args[1] &&
            row.status === "processing" &&
            row.claimToken === args[2]
          ) {
            rows.delete(id);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return {
    db,
    expireLease(source: string, eventId: string) {
      const row = rows.get(`${source}:${eventId}`);
      if (row) row.claimedAt = Date.now() - 11 * 60 * 1000;
    },
    row(source: string, eventId: string) {
      return rows.get(`${source}:${eventId}`);
    },
  };
}

describe("webhook idempotency leases", () => {
  it("atomically rejects a concurrent duplicate", async () => {
    const memory = memoryDb();
    const first = await claimWebhook(memory.db, "stripe", "evt_1");
    const second = await claimWebhook(memory.db, "stripe", "evt_1");

    expect(first.state).toBe("claimed");
    expect(second).toEqual({ state: "duplicate" });
  });

  it("recovers an expired lease without letting the stale owner finish or delete it", async () => {
    const memory = memoryDb();
    const first = await claimWebhook(memory.db, "stripe", "evt_2");
    expect(first.state).toBe("claimed");
    if (first.state !== "claimed") throw new Error("expected first claim");

    memory.expireLease("stripe", "evt_2");
    const replacement = await claimWebhook(memory.db, "stripe", "evt_2");
    expect(replacement.state).toBe("claimed");
    if (replacement.state !== "claimed") {
      throw new Error("expected replacement claim");
    }
    expect(replacement.token).not.toBe(first.token);

    expect(
      await completeWebhook(memory.db, "stripe", "evt_2", first.token),
    ).toBe(false);
    await releaseWebhook(memory.db, "stripe", "evt_2", first.token);
    expect(memory.row("stripe", "evt_2")?.claimToken).toBe(
      replacement.token,
    );
    expect(
      await completeWebhook(
        memory.db,
        "stripe",
        "evt_2",
        replacement.token,
      ),
    ).toBe(true);
    expect(memory.row("stripe", "evt_2")?.status).toBe("processed");
  });
});
