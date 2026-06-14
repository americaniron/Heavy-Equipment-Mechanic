import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { complete, RateLimitError } from "../lib/anthropic";
import { effectiveTier } from "../lib/tier";
import {
  PROMPT_VERSION,
  REPAIR_PLAN_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "../prompts/repair-plan";
import { RepairPlanInput, RepairPlanOutput } from "../lib/repair-plan-schema";
import { diagnosticSession } from "../lib/diagnostic-session-client";
import { log } from "../lib/log";

export const repairPlanRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

repairPlanRoutes.use("*", requireAuth);

function stripFences(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const end = t.lastIndexOf("```");
  return t.slice(t.indexOf("\n") + 1, end > 0 ? end : undefined).trim();
}

function safeJson(value: unknown, fallback: unknown) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildUserMessage(args: {
  machine: string;
  causes: string;
  tests: string;
  parts: string;
}): string {
  return [
    REPAIR_PLAN_OUTPUT_INSTRUCTIONS,
    "",
    `MACHINE: ${args.machine}`,
    "",
    "DIAGNOSIS — POSSIBLE CAUSES (most likely first):",
    args.causes,
    "",
    "DIAGNOSIS — TESTS ALREADY ORDERED CHEAPEST-FIRST:",
    args.tests,
    "",
    "DIAGNOSIS — PARTS LIKELY NEEDED:",
    args.parts || "(none specified)",
    "",
    "Build the repair plan a shop foreman would hand to a tech.",
  ].join("\n");
}

repairPlanRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => null);
  const parsed = RepairPlanInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid input — session_id required");
  }

  // Ownership check via D1.
  const owned = await c.env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND customer_id = ?2",
  )
    .bind(Number(parsed.data.session_id), Number(userId))
    .first<{ id: string }>();
  if (!owned) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");

  const state = await diagnosticSession.getState(c.env, userId, parsed.data.session_id);
  let playbook = state.playbook as
    | {
        possible_causes?: Array<{ cause: string; likelihood: string; reasoning: string }>;
        tests_in_order?: Array<{ test: string; tools?: string[] }>;
        parts_likely_needed?: Array<{ part_number: string; description: string }>;
      }
    | null;
  let sessionInput = state.input as
    | { machine_make?: string; machine_model?: string }
    | null;
  if (!playbook) {
    const result = await c.env.DB.prepare(
      "SELECT possible_causes, tests_in_order, parts_likely_needed FROM diagnostic_results WHERE session_id = ?1",
    )
      .bind(Number(parsed.data.session_id))
      .first<Record<string, unknown>>();
    const session = await c.env.DB.prepare(
      "SELECT machine_make, machine_model FROM diagnostic_sessions WHERE id = ?1",
    )
      .bind(Number(parsed.data.session_id))
      .first<Record<string, unknown>>();
    playbook = result
      ? {
          possible_causes: safeJson(result.possible_causes, []) as Array<{ cause: string; likelihood: string; reasoning: string }>,
          tests_in_order: safeJson(result.tests_in_order, []) as Array<{ test: string; tools?: string[] }>,
          parts_likely_needed: safeJson(result.parts_likely_needed, []) as Array<{ part_number: string; description: string }>,
        }
      : null;
    sessionInput = {
      machine_make: String(session?.machine_make ?? "Unknown machine"),
      machine_model: String(session?.machine_model ?? ""),
    };
  }

  if (!playbook || !playbook.possible_causes || !playbook.tests_in_order) {
    return jsonError(
      c,
      400,
      ErrorCode.BadRequest,
      "Session has no structured playbook to plan from.",
      "Run a Pro/Shop scenario diagnosis first; chat-mode sessions don't carry a structured playbook.",
    );
  }

  const machine =
    `${sessionInput?.machine_make ?? "Unknown machine"} ${sessionInput?.machine_model ?? ""}`.trim();
  const causes = playbook.possible_causes
    .map(
      (c, i) =>
        `${i + 1}. (${c.likelihood}) ${c.cause} — ${c.reasoning}`,
    )
    .join("\n");
  const tests = playbook.tests_in_order
    .map((t, i) => `${i + 1}. ${t.test}${t.tools && t.tools.length > 0 ? ` [tools: ${t.tools.join(", ")}]` : ""}`)
    .join("\n");
  const parts = (playbook.parts_likely_needed ?? [])
    .map((p) => `${p.part_number || "(part # tbd)"} — ${p.description}`)
    .join("\n");

  const tier = await effectiveTier(c.env.DB, userId);

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage({ machine, causes, tests, parts }) }],
      userId,
      maxTokens: 2_000,
      temperature: 0.3,
      requestId,
      rateLimitPerHour: tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(c, 502, ErrorCode.Upstream, "Repair-plan model unavailable.");
  }

  let plan: RepairPlanOutput;
  try {
    plan = RepairPlanOutput.parse(JSON.parse(stripFences(result.text)));
  } catch (e) {
    log.error("repair_plan_invalid_output", {
      requestId,
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(c, 502, ErrorCode.Upstream, "Repair-plan model returned malformed output.");
  }

  return c.json({
    session_id: parsed.data.session_id,
    plan,
    model_used: result.modelUsed,
    prompt_version: PROMPT_VERSION,
  });
});
