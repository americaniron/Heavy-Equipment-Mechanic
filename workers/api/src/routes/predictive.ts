import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { complete, RateLimitError } from "../lib/anthropic";
import { effectiveTier } from "../lib/tier";
import {
  PROMPT_VERSION,
  PREDICTIVE_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "../prompts/predictive";
import { PredictiveOutput } from "../lib/predictive-schema";
import { log } from "../lib/log";

export const predictiveRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

predictiveRoutes.use("*", requireAuth);

interface EquipmentRow {
  id: string;
  make: string;
  model: string;
  year: number | null;
  serial: string | null;
  hours: number | null;
}
interface SessionSummaryRow {
  id: string;
  created_at: number;
  summary_json: string | null;
  status: string;
}

function stripFences(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const end = t.lastIndexOf("```");
  return t.slice(t.indexOf("\n") + 1, end > 0 ? end : undefined).trim();
}

predictiveRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");

  const eq = await c.env.DB.prepare(
    `SELECT id, make, model, year, serial, hours
     FROM equipment WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(userId)
    .all<EquipmentRow>();
  const equipment = eq.results ?? [];

  if (equipment.length === 0) {
    // Empty-state contract: return a cleanly empty payload, NOT an error.
    return c.json({
      predictions: [],
      empty_state: "no_equipment",
      empty_message:
        "Add equipment and complete diagnostics to enable predictions.",
      model_used: null,
      prompt_version: PROMPT_VERSION,
    });
  }

  // Recent diagnosis history for context. Cap at 20 most-recent so we
  // don't blow the context window for users with long histories.
  const sess = await c.env.DB.prepare(
    `SELECT id, created_at, summary_json, status
     FROM diagnostic_sessions
     WHERE user_id = ?1
     ORDER BY created_at DESC
     LIMIT 20`,
  )
    .bind(userId)
    .all<SessionSummaryRow>();
  const sessions = sess.results ?? [];

  if (sessions.length === 0) {
    // We CAN still ask for predictions ("monitoring" risk scores), but
    // the user's empty-state expectation is "complete diagnostics first".
    // Return the empty-state contract so the UI shows the helpful CTA.
    return c.json({
      predictions: [],
      empty_state: "no_diagnoses",
      empty_message:
        "Complete at least one diagnosis to enable predictions.",
      model_used: null,
      prompt_version: PROMPT_VERSION,
    });
  }

  const equipmentSection = equipment
    .map((e) => {
      const yearStr = e.year !== null ? ` ${e.year}` : "";
      const hoursStr = e.hours !== null ? ` (${e.hours.toLocaleString()} hr)` : "";
      const serialStr = e.serial ? ` SN: ${e.serial}` : "";
      return `  ${e.id}  ${e.make} ${e.model}${yearStr}${hoursStr}${serialStr}`;
    })
    .join("\n");

  const historySection = sessions
    .map((s) => {
      const date = new Date(s.created_at * 1000).toISOString().slice(0, 10);
      const summary = s.summary_json
        ? (() => {
            try {
              const parsed = JSON.parse(s.summary_json) as {
                machine?: string;
                causeCount?: number;
                partCount?: number;
              };
              return `machine=${parsed.machine ?? "?"} causes=${parsed.causeCount ?? 0} parts=${parsed.partCount ?? 0}`;
            } catch {
              return "(unparseable summary)";
            }
          })()
        : "(chat-mode session, no structured summary)";
      return `  ${date}  ${s.status}  ${summary}`;
    })
    .join("\n");

  const userMessage = [
    PREDICTIVE_OUTPUT_INSTRUCTIONS,
    "",
    "FLEET (return one prediction per equipment_id, do not skip any):",
    equipmentSection,
    "",
    `RECENT DIAGNOSIS HISTORY (last ${sessions.length} sessions, newest first):`,
    historySection,
  ].join("\n");

  const tier = await effectiveTier(c.env.DB, userId);

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      userId,
      maxTokens: 2_500,
      temperature: 0.3,
      requestId,
      rateLimitPerHour: tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(c, 502, ErrorCode.Upstream, "Predictive model unavailable.");
  }

  let parsed: PredictiveOutput;
  try {
    parsed = PredictiveOutput.parse(JSON.parse(stripFences(result.text)));
  } catch (e) {
    log.error("predictive_invalid_output", {
      requestId,
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "Predictive model returned malformed output.",
    );
  }

  // Drop predictions for equipment_ids not in the user's fleet (defense
  // against the model hallucinating an id) and join with equipment data.
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const cleaned = parsed.predictions
    .filter((p) => eqById.has(p.equipment_id))
    .map((p) => ({
      ...p,
      equipment: eqById.get(p.equipment_id)!,
    }));

  return c.json({
    predictions: cleaned,
    empty_state: null,
    empty_message: null,
    fleet_size: equipment.length,
    diagnoses_considered: sessions.length,
    model_used: result.modelUsed,
    prompt_version: PROMPT_VERSION,
  });
});
