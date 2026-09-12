import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { effectiveTier } from "../lib/tier";
import { normalizeFaultCode } from "../lib/fault-normalize";

export const faultCodesRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

faultCodesRoutes.use("*", requireAuth);

/**
 * Pre-Paddle FEATURE FLAG (per current scope decision):
 * `viewerSeesPaidFields()` returns true for ALL signed-in users so the
 * fault-code page renders the rich view while billing is deferred. When
 * Paddle activates, change this to `tier === 'pro' || tier === 'shop'`
 * — the rest of the gate logic is already wired and tested.
 */
const VIEWER_SEES_PAID_FIELDS_FOR_ALL = false;
function viewerSeesPaidFields(tier: "free" | "pro" | "shop"): boolean {
  if (VIEWER_SEES_PAID_FIELDS_FOR_ALL) return true;
  return tier === "pro" || tier === "shop";
}

interface FaultCodeRow {
  code: string;
  description: string;
  severity: string | null;
  likely_causes: string | null;
  repair_actions: string | null;
  source_url: string | null;
  last_refreshed: string;
  manufacturer?: string | null;
  spn?: string | null;
  fmi?: string | null;
  provenance?: string | null;
}

function safeParseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    const trimmed = s.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const body = trimmed.slice(1, -1);
      return body
        .match(/"((?:[^"\\]|\\.)*)"|[^,]+/g)
        ?.map((part) => part.trim().replace(/^"|"$/g, "").replace(/\\"/g, "\""))
        .filter(Boolean) ?? [];
    }
    return [];
  }
}

const SearchQuery = z.object({
  q: z.string().trim().min(2).max(80).optional(),
  manufacturer: z.string().trim().min(2).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

faultCodesRoutes.get("/search", async (c) => {
  const url = new URL(c.req.url);
  const parsed = SearchQuery.safeParse({
    q: url.searchParams.get("q") || undefined,
    manufacturer: url.searchParams.get("manufacturer") || undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "q must be 2-80 chars");
  }
  const { q, manufacturer, limit = 25 } = parsed.data;
  const normalized = q ? normalizeFaultCode(q) : "";
  const maker = manufacturer ? manufacturer.toLowerCase() : "";
  if (!normalized && !maker) {
    const r = await c.env.DB.prepare(
      "SELECT code, description, severity, manufacturer FROM fault_codes ORDER BY last_refreshed DESC LIMIT ?1",
    )
      .bind(limit)
      .all<{ code: string; description: string; severity: string | null; manufacturer: string | null }>();
    return c.json({ results: r.results ?? [], total_estimate: 0 });
  }
  const pattern = `%${normalized.replace(/[%_]/g, "")}%`;
  const r = await c.env.DB.prepare(
    `SELECT code, description, severity, manufacturer
     FROM fault_codes
     WHERE (
        ?1 = '' OR code LIKE ?2 OR description LIKE ?2 OR IFNULL(spn,'') LIKE ?2 OR IFNULL(fmi,'') LIKE ?2
     )
     AND (
        ?3 = '' OR lower(IFNULL(manufacturer,'')) = ?3
     )
     ORDER BY
       CASE WHEN code LIKE ?4 THEN 0 ELSE 1 END,
       length(code), code
     LIMIT ?5`,
  )
    .bind(normalized, pattern, maker, `${normalized}%`, limit)
    .all<{ code: string; description: string; severity: string | null; manufacturer: string | null }>();
  return c.json({ results: r.results ?? [] });
});

faultCodesRoutes.get("/:code", async (c) => {
  const userId = c.get("userId") as string;
  const code = c.req.param("code");
  if (!code || code.length > 60) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid code");
  }
  const row = await c.env.DB.prepare(
    `SELECT code, description, severity, likely_causes, repair_actions,
            source_url, last_refreshed, manufacturer, spn, fmi, provenance
     FROM fault_codes WHERE code = ?1`,
  )
    .bind(code)
    .first<FaultCodeRow & { manufacturer?: string | null; spn?: string | null; fmi?: string | null; provenance?: string | null }>();
  if (!row) return jsonError(c, 404, ErrorCode.NotFound, "Fault code not found");

  const tier = await effectiveTier(c.env.DB, userId);
  const showPaid = viewerSeesPaidFields(tier);

  // FREE shape always includes code + description + severity.
  const free = {
    code: row.code,
    description: row.description,
    severity: row.severity,
    manufacturer: row.manufacturer ?? null,
  };

  if (!showPaid) {
    return c.json({
      ...free,
      paid_fields_locked: true,
      upgrade_hint: "Upgrade to Pro or Shop to see causes, repair actions, and related parts.",
    });
  }

  // PRO/SHOP: include causes + actions + related parts.
  const causes = safeParseJsonArray(row.likely_causes);
  const actions = safeParseJsonArray(row.repair_actions);

  // Related parts: find catalog parts whose description mentions any
  // significant token from the fault description (cheap heuristic).
  const tokens = row.description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 5)
    .slice(0, 5);
  let relatedParts: Array<{ part_number: string; description: string; price_usd: number | null }> = [];
  if (tokens.length > 0) {
    const fts = tokens.map((t) => `"${t}"`).join(" OR ");
    const r = await c.env.DB.prepare(
      `SELECT p.part_number, p.description, p.price_usd
       FROM parts_fts JOIN parts p ON p.id = parts_fts.rowid
       WHERE parts_fts MATCH ?1
       ORDER BY bm25(parts_fts)
       LIMIT 6`,
    )
      .bind(fts)
      .all<{ part_number: string; description: string; price_usd: number | null }>();
    relatedParts = r.results ?? [];
  }

  return c.json({
    ...free,
    likely_causes: causes,
    repair_actions: actions,
    related_parts: relatedParts,
    source_url: row.source_url,
    last_refreshed: row.last_refreshed,
    spn: row.spn ?? null,
    fmi: row.fmi ?? null,
    provenance: row.provenance ?? null,
    paid_fields_locked: false,
  });
});
