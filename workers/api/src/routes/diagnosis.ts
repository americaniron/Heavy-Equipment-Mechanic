import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { effectiveTier } from "../lib/tier";
import {
  checkQuota,
  incrementQuota,
  DIAGNOSIS_FREE_MONTHLY_LIMIT,
} from "../lib/diagnosis-quota";
import { complete, RateLimitError } from "../lib/anthropic";
import {
  PROMPT_VERSION,
  SCENARIO_OUTPUT_INSTRUCTIONS,
  SYSTEM_PROMPT,
} from "../prompts/diagnosis";
import {
  ChatInput,
  ScenarioInput,
  ScenarioOutput,
} from "../lib/diagnosis-schema";
import { diagnosticSession } from "../lib/diagnostic-session-client";
import { log } from "../lib/log";

export const diagnosisRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

diagnosisRoutes.use("*", requireAuth);

// ---------------------------------------------------------------- helpers --

function newSessionId(): string {
  return crypto.randomUUID();
}

function buildScenarioUserMessage(input: ScenarioInput): string {
  const partsCatalogContext = `Parts catalog context: the user's signed-in account has access to ` +
    `~43,000 parts across CAT (cat_parts_inventory.xls) and Costex (costex_2026.pdf). ` +
    `Cite real CAT-style part numbers in parts_likely_needed when you have evidence; ` +
    `otherwise leave part_number empty rather than fabricating.`;
  const lines: string[] = [
    SCENARIO_OUTPUT_INSTRUCTIONS,
    "",
    partsCatalogContext,
    "",
    "MACHINE:",
    `  Make:  ${input.machine_make}`,
    `  Model: ${input.machine_model}`,
    `  Year:  ${input.year ?? "unknown"}`,
    `  Hours: ${input.hours ?? "unknown"}`,
    "",
    "OPERATOR-DESCRIBED SYMPTOMS:",
    input.symptoms,
  ];
  if (input.fault_codes.length > 0) {
    lines.push("");
    lines.push("ACTIVE FAULT CODES:");
    for (const code of input.fault_codes) lines.push(`  - ${code}`);
  }
  if (input.recent_service.length > 0) {
    lines.push("");
    lines.push("RECENT SERVICE / WORK PERFORMED:");
    for (const svc of input.recent_service) lines.push(`  - ${svc}`);
  }
  if (input.operator_notes.trim()) {
    lines.push("");
    lines.push("OPERATOR NOTES:");
    lines.push(input.operator_notes);
  }
  return lines.join("\n");
}

function stripJsonFences(text: string): string {
  // Some models still wrap JSON in ```json fences despite instructions.
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const end = trimmed.lastIndexOf("```");
    return trimmed
      .slice(trimmed.indexOf("\n") + 1, end > 0 ? end : undefined)
      .trim();
  }
  return trimmed;
}

// -------------------------------------------------------------- POST /scenario --

diagnosisRoutes.post("/scenario", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => null);
  const parsed = ScenarioInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      c,
      400,
      ErrorCode.BadRequest,
      "Invalid scenario input",
      parsed.error.issues[0]?.message,
    );
  }

  const tier = await effectiveTier(c.env.DB, userId);
  if (tier === "free") {
    return jsonError(
      c,
      403,
      ErrorCode.TierRequired,
      "Scenario engine requires the Pro plan or higher.",
      "Free tier supports plain chat (3 diagnoses/month). Upgrade at /pricing.",
    );
  }

  const quota = await checkQuota({ db: c.env.DB, userId, tier });
  if (!quota.ok) {
    return jsonError(
      c,
      402,
      ErrorCode.TierRequired,
      `Monthly diagnosis limit reached (${quota.limit}/month).`,
      "Upgrade to Pro or Shop for unlimited diagnoses.",
    );
  }

  const sessionId = newSessionId();
  await diagnosticSession.init(c.env, userId, sessionId, {
    tierAtCreation: tier,
    mode: "scenario",
  });
  await diagnosticSession.setInput(c.env, userId, sessionId, parsed.data);

  const userMessage = buildScenarioUserMessage(parsed.data);
  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      userId,
      maxTokens: 4096,
      temperature: 0.4,
      requestId,
      rateLimitPerHour:
        tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(
        c,
        429,
        ErrorCode.RateLimited,
        "AI rate limit reached.",
        `Try again in ${Math.ceil(e.resetMs / 1000)}s.`,
      );
    }
    log.error("diagnosis_scenario_anthropic_failed", {
      requestId,
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "The diagnostic model is temporarily unavailable.",
      "Try again in a moment.",
    );
  }

  let playbook: ScenarioOutput;
  try {
    const json = JSON.parse(stripJsonFences(result.text));
    playbook = ScenarioOutput.parse(json);
  } catch (e) {
    log.error("diagnosis_scenario_invalid_output", {
      requestId,
      userId,
      modelUsed: result.modelUsed,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "The diagnostic model returned malformed output.",
      "Try resubmitting — the input may have triggered an unusual response.",
    );
  }

  await diagnosticSession.setPlaybook(c.env, userId, sessionId, playbook);
  await diagnosticSession.appendTurn(c.env, userId, sessionId, {
    role: "user",
    content: userMessage,
  });
  await diagnosticSession.appendTurn(c.env, userId, sessionId, {
    role: "assistant",
    content: result.text,
  });

  // Mirror a thin pointer row in D1 for analytics + repair-plan join.
  await c.env.DB.prepare(
    `INSERT INTO diagnostic_sessions
       (id, user_id, tier_at_creation, status, summary_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'open', ?4, unixepoch(), unixepoch())`,
  )
    .bind(
      sessionId,
      userId,
      tier,
      JSON.stringify({
        machine: `${parsed.data.machine_make} ${parsed.data.machine_model}`,
        causeCount: playbook.possible_causes.length,
        partCount: playbook.parts_likely_needed.length,
      }),
    )
    .run();

  await incrementQuota({ db: c.env.DB, userId, monthKey: quota.monthKey });

  return c.json({
    session_id: sessionId,
    playbook,
    model_used: result.modelUsed,
    prompt_version: PROMPT_VERSION,
    monthly_remaining: quota.remaining,
  });
});

// -------------------------------------------------------------- POST /chat --

diagnosisRoutes.post("/chat", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => null);
  const parsed = ChatInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid chat input");
  }

  const tier = await effectiveTier(c.env.DB, userId);
  const quota = await checkQuota({ db: c.env.DB, userId, tier });
  if (!quota.ok) {
    return jsonError(
      c,
      402,
      ErrorCode.TierRequired,
      `Monthly diagnosis limit reached (${DIAGNOSIS_FREE_MONTHLY_LIMIT}/month).`,
      "Upgrade to Pro or Shop for unlimited diagnoses.",
    );
  }

  const sessionId = newSessionId();
  await diagnosticSession.init(c.env, userId, sessionId, {
    tierAtCreation: tier,
    mode: "chat",
  });

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.message }],
      userId,
      maxTokens: 2_048,
      temperature: 0.5,
      requestId,
      rateLimitPerHour:
        tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "The diagnostic model is temporarily unavailable.",
    );
  }

  await diagnosticSession.appendTurn(c.env, userId, sessionId, {
    role: "user",
    content: parsed.data.message,
  });
  await diagnosticSession.appendTurn(c.env, userId, sessionId, {
    role: "assistant",
    content: result.text,
  });

  await c.env.DB.prepare(
    `INSERT INTO diagnostic_sessions
       (id, user_id, tier_at_creation, status, summary_json, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'open', NULL, unixepoch(), unixepoch())`,
  )
    .bind(sessionId, userId, tier)
    .run();
  await incrementQuota({ db: c.env.DB, userId, monthKey: quota.monthKey });

  return c.json({
    session_id: sessionId,
    reply: result.text,
    model_used: result.modelUsed,
    monthly_remaining: quota.remaining,
  });
});

// -------------------------------------------------------------- GET /:id --

const SessionIdParam = z.object({ id: z.string().uuid() });

diagnosisRoutes.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const params = SessionIdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid session id");
  }
  // Verify ownership via D1 first — DO is keyed on userId so we can't
  // accidentally read another user's session, but the D1 row is the
  // canonical "did this user own this session" check.
  const row = await c.env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND user_id = ?2",
  )
    .bind(params.data.id, userId)
    .first<{ id: string }>();
  if (!row) {
    return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  }
  const state = await diagnosticSession.getState(c.env, userId, params.data.id);
  return c.json({ session_id: params.data.id, ...state });
});

// -------------------------------------------------------- POST /:id/messages --

diagnosisRoutes.post("/:id/messages", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const params = SessionIdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid session id");
  }
  const body = await c.req.json().catch(() => null);
  const parsed = ChatInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid message");
  }

  const owned = await c.env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND user_id = ?2",
  )
    .bind(params.data.id, userId)
    .first<{ id: string }>();
  if (!owned) {
    return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  }

  // Continuation messages don't burn the monthly quota — only NEW
  // diagnoses (POST /scenario or POST /chat) count.
  const tier = await effectiveTier(c.env.DB, userId);

  const state = await diagnosticSession.getState(c.env, userId, params.data.id);
  const history = state.turns.map((t) => ({
    role: t.role === "system" ? ("user" as const) : t.role,
    content: t.content,
  }));
  history.push({ role: "user", content: parsed.data.message });

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: history,
      userId,
      maxTokens: 2_048,
      temperature: 0.5,
      requestId,
      rateLimitPerHour:
        tier === "shop" ? 1000 : tier === "pro" ? 300 : 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(c, 502, ErrorCode.Upstream, "Model unavailable.");
  }

  await diagnosticSession.appendTurn(c.env, userId, params.data.id, {
    role: "user",
    content: parsed.data.message,
  });
  await diagnosticSession.appendTurn(c.env, userId, params.data.id, {
    role: "assistant",
    content: result.text,
  });

  return c.json({
    session_id: params.data.id,
    reply: result.text,
    model_used: result.modelUsed,
  });
});

// -------------------------------------------------------- GET /:id/pdf --

diagnosisRoutes.get("/:id/pdf", (c) => {
  // PDF export is DEFERRED in this build — see DEPLOY_NOTES.md.
  // Returning 503 with hint instead of fabricating a stub PDF.
  return jsonError(
    c,
    503,
    ErrorCode.Internal,
    "PDF export is temporarily unavailable.",
    "PDF export ships in a follow-up release.",
  );
});
