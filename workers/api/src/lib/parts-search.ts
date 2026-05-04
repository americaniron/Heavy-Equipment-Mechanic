/**
 * Build a safe FTS5 MATCH expression from an arbitrary user query.
 *
 * FTS5 has a query syntax (operators *, ", AND, OR, NOT, NEAR, column
 * filters with `col:`) that is unsafe to expose to untrusted input.
 * We tokenize on whitespace, drop tokens shorter than 2 chars, strip
 * embedded double-quotes, then wrap each token in double-quotes so
 * FTS5 treats them as literal phrases. Tokens are joined with implicit
 * AND (a space between phrases means AND in FTS5).
 *
 * Returns null when the query has no usable tokens — caller should
 * surface a 400 with hint instead of running an unbounded scan.
 */
export function buildFtsQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/"/g, "").trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" ");
}

export interface SearchInput {
  q: string;
  make: string | null;
  category: string | null;
  cursorRank: number | null;
  cursorId: number | null;
  limit: number;
}

export interface SearchRow {
  id: number;
  part_number: string;
  description: string;
  category: string | null;
  make: string;
  price_usd: number | null;
  stock_status: string | null;
  source_file: string;
  rank: number;
}

/**
 * Run an FTS5 search with optional make/category filters and (rank,id)
 * cursor pagination. Returns one extra row to detect "has more" without
 * a second query.
 *
 * Pagination invariant: ORDER BY rank ASC, id ASC.  bm25 returns
 * negative numbers (lower = better) so this puts best matches first.
 * Cursor predicate uses tuple comparison via a logically equivalent
 * boolean: (rank, id) > (cr, ci) ⇔ rank > cr OR (rank = cr AND id > ci).
 */
export async function runSearch(
  db: D1Database,
  input: SearchInput,
): Promise<{ rows: SearchRow[]; hasMore: boolean }> {
  const ftsQuery = buildFtsQuery(input.q);
  if (!ftsQuery) return { rows: [], hasMore: false };

  // We fetch limit+1 to detect "has more" cheaply.
  const fetchN = input.limit + 1;
  const stmt = db
    .prepare(
      `SELECT
         p.id            AS id,
         p.part_number   AS part_number,
         p.description   AS description,
         p.category      AS category,
         p.make          AS make,
         p.price_usd     AS price_usd,
         p.stock_status  AS stock_status,
         p.source_file   AS source_file,
         bm25(parts_fts) AS rank
       FROM parts_fts
       JOIN parts p ON p.id = parts_fts.rowid
       WHERE parts_fts MATCH ?1
         AND (?2 IS NULL OR p.make = ?2)
         AND (?3 IS NULL OR p.category = ?3)
         AND (
           ?4 IS NULL
           OR bm25(parts_fts) > ?4
           OR (bm25(parts_fts) = ?4 AND p.id > ?5)
         )
       ORDER BY bm25(parts_fts) ASC, p.id ASC
       LIMIT ?6`,
    )
    .bind(
      ftsQuery,
      input.make,
      input.category,
      input.cursorRank,
      input.cursorId,
      fetchN,
    );
  const result = await stmt.all<SearchRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > input.limit;
  return { rows: hasMore ? rows.slice(0, input.limit) : rows, hasMore };
}

export async function countMatches(
  db: D1Database,
  input: Pick<SearchInput, "q" | "make" | "category">,
): Promise<number> {
  const ftsQuery = buildFtsQuery(input.q);
  if (!ftsQuery) return 0;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM parts_fts
       JOIN parts p ON p.id = parts_fts.rowid
       WHERE parts_fts MATCH ?1
         AND (?2 IS NULL OR p.make = ?2)
         AND (?3 IS NULL OR p.category = ?3)`,
    )
    .bind(ftsQuery, input.make, input.category)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export interface ParsedQuery {
  ok: true;
  q: string;
  make: string | null;
  category: string | null;
  limit: number;
  cursor: { r: number; i: number } | null;
}
export interface ParsedQueryError {
  ok: false;
  message: string;
  hint?: string;
}

const MIN_Q_CHARS = 2;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function parseSearchQuery(
  searchParams: URLSearchParams,
  decodeCursorFn: (s: string | null) => { rank: number; id: number } | null,
): ParsedQuery | ParsedQueryError {
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < MIN_Q_CHARS) {
    return {
      ok: false,
      message: `q is required and must be at least ${MIN_Q_CHARS} characters`,
      hint: "Try a part number or a phrase like 'hydraulic pump'.",
    };
  }
  const limitRaw = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || n < 1) {
      return { ok: false, message: "limit must be a positive integer" };
    }
    limit = Math.min(MAX_LIMIT, Math.floor(n));
  }
  const cursor = decodeCursorFn(searchParams.get("cursor"));
  const cursorObj = cursor ? { r: cursor.rank, i: cursor.id } : null;
  return {
    ok: true,
    q,
    make: searchParams.get("make"),
    category: searchParams.get("category"),
    limit,
    cursor: cursorObj,
  };
}
