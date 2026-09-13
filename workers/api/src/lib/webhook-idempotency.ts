import { selectOne } from "./d1-helpers";

export type WebhookClaim =
  | { state: "claimed"; token: string }
  | { state: "duplicate" }
  | { state: "fallback" };
const CLAIM_LEASE_MINUTES = 10;

function key(source: string, eventId: string): string {
  return `${source}:${eventId}`;
}

/**
 * Atomically claim a webhook in D1. The namespaced key avoids collisions
 * between providers while remaining compatible with the historical table
 * whose primary key is only `id`.
 *
 * `fallback` means D1 was unavailable; callers may use their KV replay cache
 * as a degraded, eventually-consistent fallback.
 */
export async function claimWebhook(
  db: D1Database,
  source: string,
  eventId: string,
): Promise<WebhookClaim> {
  const claimToken = crypto.randomUUID();
  try {
    const legacy = await selectOne<{ id: string }>(
      db,
      "SELECT id FROM processed_webhooks WHERE id = ?1 AND source = ?2 LIMIT 1",
      eventId,
      source,
    );
    if (legacy) return { state: "duplicate" };
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO processed_webhooks
           (id, source, status, claimed_at, claim_token, attempt_count)
         VALUES (?1, ?2, 'processing', datetime('now'), ?3, 1)`,
      )
      .bind(key(source, eventId), source, claimToken)
      .run();
    if (result.meta.changes) return { state: "claimed", token: claimToken };

    const existing = await selectOne<{
      status: string | null;
      claimed_at: string | null;
    }>(
      db,
      "SELECT status, claimed_at FROM processed_webhooks WHERE id = ?1 AND source = ?2",
      key(source, eventId),
      source,
    );
    // Rows written by the historical implementation have a null/defaulted
    // status and represent events that completed before the row was inserted.
    if (!existing || existing.status !== "processing") {
      return { state: "duplicate" };
    }

    const reclaimed = await db
      .prepare(
        `UPDATE processed_webhooks
            SET claimed_at = datetime('now'),
                claim_token = ?3,
                attempt_count = COALESCE(attempt_count, 0) + 1
          WHERE id = ?1 AND source = ?2 AND status = 'processing'
            AND (
              claimed_at IS NULL
              OR claimed_at <= datetime('now', ?4)
            )`,
      )
      .bind(
        key(source, eventId),
        source,
        claimToken,
        `-${CLAIM_LEASE_MINUTES} minutes`,
      )
      .run();
    return reclaimed.meta.changes
      ? { state: "claimed", token: claimToken }
      : { state: "duplicate" };
  } catch {
    return { state: "fallback" };
  }
}

export async function completeWebhook(
  db: D1Database,
  source: string,
  eventId: string,
  claimToken: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE processed_webhooks
          SET status = 'processed', processed_at = datetime('now')
        WHERE id = ?1 AND source = ?2 AND status = 'processing'
          AND claim_token = ?3`,
    )
    .bind(key(source, eventId), source, claimToken)
    .run();
  return Boolean(result.meta.changes);
}

/** Release only in-progress claims created by the current implementation. */
export async function releaseWebhook(
  db: D1Database,
  source: string,
  eventId: string,
  claimToken: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM processed_webhooks
        WHERE id = ?1 AND source = ?2 AND status = 'processing'
          AND claim_token = ?3`,
    )
    .bind(key(source, eventId), source, claimToken)
    .run()
    .catch(() => undefined);
}
