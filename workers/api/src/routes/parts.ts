import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import {
  checkAndIncrement,
  WINDOW_MINUTE_MS,
} from "../lib/ratelimit";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import {
  countMatches,
  parseSearchQuery,
  runSearch,
} from "../lib/parts-search";

const PARTS_SEARCH_PER_MINUTE = 60;

export const partsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

partsRoutes.use("*", requireAuth);

partsRoutes.use("/search", async (c, next) => {
  const userId = c.get("userId") as string;
  const r = await checkAndIncrement({
    env: c.env,
    userId,
    scope: "parts-search",
    max: PARTS_SEARCH_PER_MINUTE,
    windowMs: WINDOW_MINUTE_MS,
  });
  if (!r.ok) {
    c.header("retry-after", Math.max(1, Math.ceil(r.resetMs / 1000)).toString());
    return jsonError(
      c,
      429,
      ErrorCode.RateLimited,
      "Too many search requests. Slow down and try again.",
      "Limit is 60 searches per minute per user.",
    );
  }
  await next();
});

partsRoutes.get("/search", async (c) => {
  const url = new URL(c.req.url);
  const parsed = parseSearchQuery(url.searchParams, decodeCursor);
  if (!parsed.ok) {
    return jsonError(c, 400, ErrorCode.BadRequest, parsed.message, parsed.hint);
  }

  const [{ rows, hasMore }, total_estimate] = await Promise.all([
    runSearch(c.env.DB, {
      q: parsed.q,
      make: parsed.make,
      category: parsed.category,
      cursorRank: parsed.cursor ? parsed.cursor.r : null,
      cursorId: parsed.cursor ? parsed.cursor.i : null,
      limit: parsed.limit,
    }),
    parsed.cursor
      ? Promise.resolve(0) // skip count on subsequent pages
      : countMatches(c.env.DB, {
          q: parsed.q,
          make: parsed.make,
          category: parsed.category,
        }),
  ]);

  let next_cursor: string | null = null;
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    next_cursor = encodeCursor({ rank: last.rank, id: last.id });
  }

  return c.json({
    results: rows.map((r) => ({
      id: r.id,
      part_number: r.part_number,
      description: r.description,
      category: r.category,
      make: r.make,
      price_usd: r.price_usd,
      stock_status: r.stock_status,
      source_file: r.source_file,
    })),
    next_cursor,
    total_estimate,
  });
});

partsRoutes.get("/facets", async (c) => {
  // Cheap to compute on-demand: ~2 makes, ~100 categories, indexed.
  const [makes, categories] = await Promise.all([
    c.env.DB.prepare(
      "SELECT DISTINCT make FROM parts WHERE make IS NOT NULL ORDER BY make",
    ).all<{ make: string }>(),
    c.env.DB.prepare(
      "SELECT category, COUNT(*) AS n FROM parts WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 200",
    ).all<{ category: string; n: number }>(),
  ]);
  return c.json({
    makes: (makes.results ?? []).map((r) => r.make),
    categories: (categories.results ?? []).map((r) => r.category),
  });
});
