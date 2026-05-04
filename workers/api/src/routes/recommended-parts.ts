import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { complete, RateLimitError } from "../lib/anthropic";
import {
  PROMPT_VERSION,
  RECOMMENDATIONS_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "../prompts/recommended-parts";
import {
  RecommendationsOutput,
  RecommendInput,
} from "../lib/recommended-parts-schema";
import { diagnosticSession } from "../lib/diagnostic-session-client";
import { effectiveTier } from "../lib/tier";
import { log } from "../lib/log";

export const recommendedPartsRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

recommendedPartsRoutes.use("*", requireAuth);

interface PartRow {
  part_number: string;
  description: string;
  category: string | null;
  make: string;
  price_usd: number | null;
  stock_status: string | null;
  source_file: string;
}

/**
 * Pull a candidate-PN list to feed into the prompt. We give Claude the
 * specific catalog rows we want it to choose from so it doesn't
 * hallucinate. For diagnosis-driven recommendations we use the
 * scenario's parts_likely_needed if any, plus a model-keyword search.
 * For cart-driven we use the cart PNs themselves.
 */
async function gatherCandidates(args: {
  env: Env;
  userId: string;
  input: RecommendInput;
}): Promise<{
  candidates: PartRow[];
  context: string;
}> {
  const { env, userId, input } = args;
  let candidates: PartRow[] = [];
  let contextLines: string[] = [];

  if (input.session_id) {
    const state = await diagnosticSession.getState(env, userId, input.session_id);
    if (!state.meta) {
      throw new Error("session_not_found");
    }
    const playbook = state.playbook as
      | { parts_likely_needed?: Array<{ part_number?: string }> }
      | null;
    const sessionInput = state.input as
      | {
          machine_make?: string;
          machine_model?: string;
          symptoms?: string;
          fault_codes?: string[];
        }
      | null;

    contextLines.push(
      `Machine: ${sessionInput?.machine_make ?? "unknown"} ${sessionInput?.machine_model ?? ""}`.trim(),
    );
    if (sessionInput?.symptoms) {
      contextLines.push(`Symptoms: ${sessionInput.symptoms}`);
    }
    if (sessionInput?.fault_codes && sessionInput.fault_codes.length > 0) {
      contextLines.push(`Fault codes: ${sessionInput.fault_codes.join(", ")}`);
    }

    const seedPNs = (playbook?.parts_likely_needed ?? [])
      .map((p) => p.part_number)
      .filter((p): p is string => !!p && p.length > 0);
    if (seedPNs.length > 0) {
      const placeholders = seedPNs.map((_, i) => `?${i + 1}`).join(",");
      const r = await env.DB.prepare(
        `SELECT part_number, description, category, make, price_usd,
                stock_status, source_file
         FROM parts
         WHERE part_number IN (${placeholders})
         LIMIT 50`,
      )
        .bind(...seedPNs)
        .all<PartRow>();
      candidates = r.results ?? [];
    }
    // Augment with FTS hits on the model name if we have spare slots.
    if (candidates.length < 12 && sessionInput?.machine_model) {
      const model = sessionInput.machine_model.replace(/"/g, "");
      const fts = `"${model.toLowerCase()}"`;
      const r = await env.DB.prepare(
        `SELECT p.part_number, p.description, p.category, p.make,
                p.price_usd, p.stock_status, p.source_file
         FROM parts_fts
         JOIN parts p ON p.id = parts_fts.rowid
         WHERE parts_fts MATCH ?1
         ORDER BY bm25(parts_fts)
         LIMIT ?2`,
      )
        .bind(fts, 12 - candidates.length)
        .all<PartRow>();
      const seen = new Set(candidates.map((c) => c.part_number));
      for (const row of r.results ?? []) {
        if (!seen.has(row.part_number)) {
          candidates.push(row);
          seen.add(row.part_number);
        }
      }
    }
  } else if (input.cart_part_numbers.length > 0) {
    contextLines.push(
      `Operator's current inquiry list: ${input.cart_part_numbers.join(", ")}`,
    );
    const placeholders = input.cart_part_numbers
      .map((_, i) => `?${i + 1}`)
      .join(",");
    const r = await env.DB.prepare(
      `SELECT part_number, description, category, make, price_usd,
              stock_status, source_file
       FROM parts
       WHERE part_number IN (${placeholders})
       LIMIT 50`,
    )
      .bind(...input.cart_part_numbers)
      .all<PartRow>();
    candidates = r.results ?? [];
  }

  return { candidates, context: contextLines.join("\n") };
}

function buildUserMessage(candidates: PartRow[], context: string): string {
  const catalogLines = candidates.map(
    (c) =>
      `  ${c.part_number}  ${c.description.slice(0, 100)}` +
      (c.price_usd != null ? `  $${c.price_usd.toFixed(2)}` : ""),
  );
  return [
    RECOMMENDATIONS_OUTPUT_INSTRUCTIONS,
    "",
    "CONTEXT FROM THE CUSTOMER'S CURRENT SITUATION:",
    context || "(no specific machine context provided; lean on the cart contents)",
    "",
    "CATALOG PART NUMBERS YOU MAY USE (do not invent any not on this list):",
    catalogLines.join("\n") || "  (no catalog candidates surfaced — return an empty cards array would be wrong; recommend bringing the issue to a shop)",
  ].join("\n");
}

function stripFences(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const end = t.lastIndexOf("```");
  return t.slice(t.indexOf("\n") + 1, end > 0 ? end : undefined).trim();
}

recommendedPartsRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => null);
  const parsed = RecommendInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      c,
      400,
      ErrorCode.BadRequest,
      "Invalid input",
      parsed.error.issues[0]?.message,
    );
  }

  let candidates: PartRow[];
  let context: string;
  try {
    const r = await gatherCandidates({ env: c.env, userId, input: parsed.data });
    candidates = r.candidates;
    context = r.context;
  } catch (e) {
    if (e instanceof Error && e.message === "session_not_found") {
      return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
    }
    throw e;
  }

  if (candidates.length === 0) {
    return jsonError(
      c,
      400,
      ErrorCode.BadRequest,
      "No candidate parts available.",
      "Run a diagnosis first or pass cart_part_numbers that exist in the catalog.",
    );
  }

  const tier = await effectiveTier(c.env.DB, userId);

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(candidates, context) }],
      userId,
      maxTokens: 2_000,
      temperature: 0.7,
      requestId,
      rateLimitPerHour: tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(c, 502, ErrorCode.Upstream, "Recommendations model unavailable.");
  }

  let recs: RecommendationsOutput;
  try {
    recs = RecommendationsOutput.parse(JSON.parse(stripFences(result.text)));
  } catch (e) {
    log.error("recommended_parts_invalid_output", {
      requestId,
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(c, 502, ErrorCode.Upstream, "Recommendations model returned malformed output.");
  }

  // FK validation: drop any card whose part_number isn't a real catalog row.
  // Look up against D1 (not just our candidate set) so the model can
  // reference catalog rows surfaced by the FTS augment that we trimmed
  // away client-side; but the candidates list is what we instructed it
  // to use, so realistic adherence is high.
  const claimedPNs = recs.cards.map((c) => c.part_number);
  if (claimedPNs.length === 0) {
    return jsonError(c, 502, ErrorCode.Upstream, "Empty recommendation set.");
  }
  const placeholders = claimedPNs.map((_, i) => `?${i + 1}`).join(",");
  const verify = await c.env.DB.prepare(
    `SELECT part_number, price_usd, stock_status FROM parts WHERE part_number IN (${placeholders})`,
  )
    .bind(...claimedPNs)
    .all<{ part_number: string; price_usd: number | null; stock_status: string | null }>();
  const verifiedPNs = new Map<string, { price: number | null; stock: string | null }>();
  for (const row of verify.results ?? []) {
    verifiedPNs.set(row.part_number, { price: row.price_usd, stock: row.stock_status });
  }

  const cleanCards = recs.cards
    .filter((card) => verifiedPNs.has(card.part_number))
    .map((card) => {
      const v = verifiedPNs.get(card.part_number)!;
      // Trust catalog price/stock over the model's claim.
      return {
        ...card,
        price_usd: v.price ?? card.price_usd,
        stock_status: v.stock,
      };
    });

  if (cleanCards.length === 0) {
    log.warn("recommended_parts_all_fabricated", {
      requestId,
      userId,
      claimed: claimedPNs,
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "The recommendations referenced parts we couldn't verify in catalog.",
      "Try again or refine the diagnosis input.",
    );
  }

  // Trim the bundle to verified PNs only.
  let bundle = recs.bundle_offer;
  if (bundle) {
    const trimmedBundlePNs = bundle.part_numbers.filter((pn) =>
      cleanCards.some((c) => c.part_number === pn),
    );
    bundle = trimmedBundlePNs.length >= 2
      ? { ...bundle, part_numbers: trimmedBundlePNs }
      : null;
  }

  return c.json({
    hero_line: recs.hero_line,
    cards: cleanCards,
    bundle_offer: bundle,
    urgency_framing: recs.urgency_framing,
    model_used: result.modelUsed,
    prompt_version: PROMPT_VERSION,
    candidates_considered: candidates.length,
    cards_returned: cleanCards.length,
  });
});
