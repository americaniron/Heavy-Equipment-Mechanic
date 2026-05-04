/**
 * Opaque base64url cursor for stable forward pagination over an
 * (orderable, unique-tiebreak) ordering. Encodes a (rank, id) pair
 * where `rank` is the SQLite FTS5 bm25 score and `id` is the parts
 * table primary key. Lower rank is a better match (FTS5 convention),
 * so forward pagination uses
 *
 *   WHERE (rank > ?) OR (rank = ? AND id > ?)
 *   ORDER BY rank, id
 *
 * Cursor format (URL-safe base64 of JSON):  {"r":<number>,"i":<number>}
 *
 * We deliberately keep this opaque and tiny (≤30 bytes typical) so
 * clients don't try to parse it. If decoding fails we silently treat
 * the cursor as "no cursor" — paging restarts cleanly without erroring.
 */

export interface PartsCursor {
  rank: number;
  id: number;
}

function b64urlEncode(s: string): string {
  // btoa is on the global scope in Workers.
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return atob(padded + pad);
  } catch {
    return null;
  }
}

export function encodeCursor(c: PartsCursor): string {
  return b64urlEncode(JSON.stringify({ r: c.rank, i: c.id }));
}

export function decodeCursor(raw: string | null | undefined): PartsCursor | null {
  if (!raw) return null;
  const json = b64urlDecode(raw);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { r?: unknown }).r !== "number" ||
    typeof (parsed as { i?: unknown }).i !== "number"
  ) {
    return null;
  }
  const { r, i } = parsed as { r: number; i: number };
  if (!Number.isFinite(r) || !Number.isFinite(i) || i < 0) return null;
  return { rank: r, id: i };
}
