import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { requireAuth } from "../lib/auth-middleware";
import { effectiveTier } from "../lib/tier";
import { checkQuota, incrementQuota } from "../lib/diagnosis-quota";
import { complete, RateLimitError } from "../lib/anthropic";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  TURN_OUTPUT_INSTRUCTIONS,
} from "../prompts/troubleshooting";
import {
  AnswerInput,
  StartInput,
  WizardTurn,
} from "../lib/troubleshooting-schema";
import { diagnosticSession } from "../lib/diagnostic-session-client";
import { log } from "../lib/log";

export const troubleshootingRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

troubleshootingRoutes.use("*", requireAuth);

const MAX_WIZARD_TURNS = 12;
const SessionIdParam = z.object({ id: z.string().uuid() });

function newSessionId(): string {
  return crypto.randomUUID();
}

function buildStartUserMessage(input: z.infer<typeof StartInput>): string {
  return [
    TURN_OUTPUT_INSTRUCTIONS,
    "",
    `MACHINE: ${input.machine_make} ${input.machine_model}`,
    "",
    "OPERATOR'S INITIAL COMPLAINT:",
    input.initial_complaint,
    "",
    "This is turn 1 of up to 12. Ask the single most diagnostic-valuable",
    "question first.",
  ].join("\n");
}

function buildContinuationMessage(
  answer: string,
  currentTurn: number,
): string {
  const remaining = MAX_WIZARD_TURNS - currentTurn;
  return [
    TURN_OUTPUT_INSTRUCTIONS,
    "",
    `Operator's answer: ${answer}`,
    "",
    `Turn ${currentTurn} of ${MAX_WIZARD_TURNS}. ` +
      `${remaining} ${remaining === 1 ? "question" : "questions"} remaining.`,
    remaining <= 2
      ? "If you have enough information, terminate with a conclusion."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripFences(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const end = t.lastIndexOf("```");
  return t.slice(t.indexOf("\n") + 1, end > 0 ? end : undefined).trim();
}

function rateLimitForTier(tier: "free" | "pro" | "shop"): number {
  return tier === "shop" ? 1000 : tier === "pro" ? 300 : 60;
}

// -------------------------------------------------------------- POST /start --

troubleshootingRoutes.post("/start", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const body = await c.req.json().catch(() => null);
  const parsed = StartInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid start input");
  }

  const tier = await effectiveTier(c.env.DB, userId);
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
    mode: "wizard",
  });
  await diagnosticSession.setInput(c.env, userId, sessionId, parsed.data);

  const userMessage = buildStartUserMessage(parsed.data);
  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      userId,
      maxTokens: 1_500,
      temperature: 0.4,
      requestId,
      rateLimitPerHour: rateLimitForTier(tier),
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
      "The wizard model is temporarily unavailable.",
    );
  }

  let turn: z.infer<typeof WizardTurn>;
  try {
    turn = WizardTurn.parse(JSON.parse(stripFences(result.text)));
  } catch (e) {
    log.error("troubleshooting_start_invalid_output", {
      requestId,
      userId,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "Wizard returned malformed output.",
    );
  }

  await diagnosticSession.appendTurn(c.env, userId, sessionId, {
    role: "user",
    content: userMessage,
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
    turn,
    turn_number: 1,
    max_turns: MAX_WIZARD_TURNS,
    model_used: result.modelUsed,
    prompt_version: PROMPT_VERSION,
    monthly_remaining: quota.remaining,
  });
});

// --------------------------------------------------------- POST /:id/answer --

troubleshootingRoutes.post("/:id/answer", async (c) => {
  const userId = c.get("userId") as string;
  const requestId = c.get("requestId");
  const params = SessionIdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid session id");
  }
  const body = await c.req.json().catch(() => null);
  const parsed = AnswerInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid answer");
  }

  const owned = await c.env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND user_id = ?2",
  )
    .bind(params.data.id, userId)
    .first<{ id: string }>();
  if (!owned) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");

  const tier = await effectiveTier(c.env.DB, userId);
  const state = await diagnosticSession.getState(c.env, userId, params.data.id);
  // Each user-then-assistant pair = 1 turn. We append BEFORE counting,
  // so the new turn is the next number.
  const priorAssistantTurns = state.turns.filter((t) => t.role === "assistant").length;
  const turnNumber = priorAssistantTurns + 1; // the assistant turn we're about to produce
  if (turnNumber > MAX_WIZARD_TURNS) {
    return jsonError(
      c,
      409,
      ErrorCode.BadRequest,
      "Wizard is at its turn cap.",
      `Max ${MAX_WIZARD_TURNS} turns reached. Start a new session.`,
    );
  }

  const continuation = buildContinuationMessage(parsed.data.answer, turnNumber);
  const history = state.turns.map((t) => ({
    role: t.role === "system" ? ("user" as const) : t.role,
    content: t.content,
  }));
  history.push({ role: "user", content: continuation });

  let result;
  try {
    result = await complete(c.env, {
      system: SYSTEM_PROMPT,
      messages: history,
      userId,
      maxTokens: 1_500,
      temperature: 0.4,
      requestId,
      rateLimitPerHour: rateLimitForTier(tier),
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      c.header("retry-after", Math.ceil(e.resetMs / 1000).toString());
      return jsonError(c, 429, ErrorCode.RateLimited, "AI rate limit reached.");
    }
    return jsonError(c, 502, ErrorCode.Upstream, "Wizard unavailable.");
  }

  let turn: z.infer<typeof WizardTurn>;
  try {
    turn = WizardTurn.parse(JSON.parse(stripFences(result.text)));
  } catch (e) {
    log.error("troubleshooting_answer_invalid_output", {
      requestId,
      userId,
      sessionId: params.data.id,
      turnNumber,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "Wizard returned malformed output.",
    );
  }

  await diagnosticSession.appendTurn(c.env, userId, params.data.id, {
    role: "user",
    content: continuation,
  });
  await diagnosticSession.appendTurn(c.env, userId, params.data.id, {
    role: "assistant",
    content: result.text,
  });

  // If the wizard terminated, mark the D1 row closed.
  if (turn.terminate) {
    await c.env.DB.prepare(
      "UPDATE diagnostic_sessions SET status = 'closed', updated_at = unixepoch() WHERE id = ?1",
    )
      .bind(params.data.id)
      .run();
  }

  return c.json({
    session_id: params.data.id,
    turn,
    turn_number: turnNumber,
    max_turns: MAX_WIZARD_TURNS,
    model_used: result.modelUsed,
  });
});

// ----------------------------------------------------------- GET /:id --

troubleshootingRoutes.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const params = SessionIdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid session id");
  }
  const owned = await c.env.DB.prepare(
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND user_id = ?2",
  )
    .bind(params.data.id, userId)
    .first<{ id: string }>();
  if (!owned) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  const state = await diagnosticSession.getState(c.env, userId, params.data.id);
  return c.json({ session_id: params.data.id, ...state });
});
