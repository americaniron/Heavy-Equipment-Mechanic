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
import { insertRow } from "../lib/d1-helpers";
import { renderDiagnosisPdf } from "../lib/diagnosis-pdf";

export const diagnosisRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

diagnosisRoutes.use("*", requireAuth);

// ---------------------------------------------------------------- helpers --

async function createDiagnosticSession(
  db: D1Database,
  customerId: string,
  mode: "scenario" | "chat",
  input: ScenarioInput | ChatInput,
): Promise<string> {
  const id = await insertRow(db, "diagnostic_sessions", {
    customer_id: Number(customerId),
    status: "open",
    machine_make: "machine_make" in input ? input.machine_make : null,
    machine_model: "machine_model" in input ? input.machine_model : null,
    machine_year: "year" in input && input.year !== null ? String(input.year) : null,
    machine_hours: "hours" in input && input.hours !== null ? String(input.hours) : null,
    symptoms: "symptoms" in input ? input.symptoms : input.message,
    fault_codes_input: "fault_codes" in input ? JSON.stringify(input.fault_codes) : JSON.stringify([]),
    recent_service: "recent_service" in input ? JSON.stringify(input.recent_service) : JSON.stringify([]),
    operator_notes: "operator_notes" in input ? input.operator_notes : mode,
  });
  return String(id);
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

function safeJson(value: unknown, fallback: unknown) {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

  const sessionId = await createDiagnosticSession(c.env.DB, userId, "scenario", parsed.data);
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
  await c.env.DB.prepare(
    "INSERT INTO diagnostic_messages (session_id, turn_number, role, content) VALUES (?1, ?2, ?3, ?4), (?1, ?5, ?6, ?7)",
  )
    .bind(Number(sessionId), 1, "user", userMessage, 2, "assistant", result.text)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO diagnostic_results
       (session_id, possible_causes, tests_in_order, expected_readings, parts_likely_needed, safety_warnings)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(session_id) DO UPDATE SET
       possible_causes = excluded.possible_causes,
       tests_in_order = excluded.tests_in_order,
       expected_readings = excluded.expected_readings,
       parts_likely_needed = excluded.parts_likely_needed,
       safety_warnings = excluded.safety_warnings,
       generated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      sessionId,
      JSON.stringify(playbook.possible_causes),
      JSON.stringify(playbook.tests_in_order),
      JSON.stringify(playbook.expected_readings),
      JSON.stringify(playbook.parts_likely_needed),
      JSON.stringify(playbook.safety_warnings),
    )
    .run();
  await c.env.DB.prepare("UPDATE diagnostic_sessions SET model_used = ?1 WHERE id = ?2")
    .bind(result.modelUsed, Number(sessionId))
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

  const sessionId = await createDiagnosticSession(c.env.DB, userId, "chat", parsed.data);
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
    "INSERT INTO diagnostic_messages (session_id, turn_number, role, content) VALUES (?1, ?2, ?3, ?4), (?1, ?5, ?6, ?7)",
  )
    .bind(Number(sessionId), 1, "user", parsed.data.message, 2, "assistant", result.text)
    .run();

  await c.env.DB.prepare("UPDATE diagnostic_sessions SET model_used = ?1 WHERE id = ?2")
    .bind(result.modelUsed, Number(sessionId))
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

const SessionIdParam = z.object({ id: z.coerce.number().int().positive().transform(String) });

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
    "SELECT * FROM diagnostic_sessions WHERE id = ?1 AND customer_id = ?2",
  )
    .bind(Number(params.data.id), Number(userId))
    .first<Record<string, unknown>>();
  if (!row) {
    return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  }
  const state = await diagnosticSession.getState(c.env, userId, params.data.id);
  if (!state.meta) {
    const [result, messages] = await Promise.all([
      c.env.DB.prepare("SELECT * FROM diagnostic_results WHERE session_id = ?1")
        .bind(Number(params.data.id))
        .first<Record<string, unknown>>(),
      c.env.DB.prepare("SELECT role, content, created_at FROM diagnostic_messages WHERE session_id = ?1 ORDER BY turn_number, id")
        .bind(Number(params.data.id))
        .all<{ role: "user" | "assistant" | "system"; content: string; created_at: string }>(),
    ]);
    return c.json({
      session_id: params.data.id,
      meta: {
        tierAtCreation: "free",
        createdAt: row.started_at ? new Date(String(row.started_at)).getTime() : Date.now(),
        mode: result ? "scenario" : "chat",
        modelUsed: row.model_used ?? undefined,
      },
      turns: (messages.results ?? []).map((message) => ({
        role: message.role,
        content: message.content,
        ts: new Date(message.created_at).getTime(),
      })),
      playbook: result
        ? {
            possible_causes: safeJson(result.possible_causes, []),
            tests_in_order: safeJson(result.tests_in_order, []),
            expected_readings: safeJson(result.expected_readings, {}),
            parts_likely_needed: safeJson(result.parts_likely_needed, []),
            safety_warnings: safeJson(result.safety_warnings, []),
          }
        : null,
      input: {
        machine_make: row.machine_make,
        machine_model: row.machine_model,
        year: row.machine_year ? Number(row.machine_year) : null,
        hours: row.machine_hours ? Number(row.machine_hours) : null,
        symptoms: row.symptoms,
        fault_codes: safeJson(row.fault_codes_input, []),
        recent_service: safeJson(row.recent_service, []),
        operator_notes: row.operator_notes ?? "",
      },
    });
  }
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
    "SELECT id FROM diagnostic_sessions WHERE id = ?1 AND customer_id = ?2",
  )
    .bind(Number(params.data.id), Number(userId))
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
  const turnCount = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(turn_number), 0) AS n FROM diagnostic_messages WHERE session_id = ?1",
  )
    .bind(Number(params.data.id))
    .first<{ n: number }>();
  const nextTurn = (turnCount?.n ?? 0) + 1;
  await c.env.DB.prepare(
    "INSERT INTO diagnostic_messages (session_id, turn_number, role, content) VALUES (?1, ?2, ?3, ?4), (?1, ?5, ?6, ?7)",
  )
    .bind(Number(params.data.id), nextTurn, "user", parsed.data.message, nextTurn + 1, "assistant", result.text)
    .run();

  return c.json({
    session_id: params.data.id,
    reply: result.text,
    model_used: result.modelUsed,
  });
});

// -------------------------------------------------------- GET /:id/pdf --

/**
 * Normalize a diagnostic_results row into the playbook shape the PDF needs.
 * Supports both the discrete-column layout written by POST /scenario
 * (possible_causes, tests_in_order, …) and a single `playbook_json` blob.
 */
function playbookFromResult(result: Record<string, unknown> | null): {
  possible_causes: unknown[];
  tests_in_order: unknown[];
  expected_readings: Record<string, string>;
  parts_likely_needed: unknown[];
  safety_warnings: string[];
} {
  const empty = {
    possible_causes: [] as unknown[],
    tests_in_order: [] as unknown[],
    expected_readings: {} as Record<string, string>,
    parts_likely_needed: [] as unknown[],
    safety_warnings: [] as string[],
  };
  if (!result) return empty;
  const base =
    result.playbook_json != null
      ? (safeJson(result.playbook_json, {}) as Record<string, unknown>)
      : {};
  const pick = (column: string, fallback: unknown) =>
    result[column] != null ? safeJson(result[column], fallback) : base[column] ?? fallback;
  return {
    possible_causes: pick("possible_causes", []) as unknown[],
    tests_in_order: pick("tests_in_order", []) as unknown[],
    expected_readings: pick("expected_readings", {}) as Record<string, string>,
    parts_likely_needed: pick("parts_likely_needed", []) as unknown[],
    safety_warnings: pick("safety_warnings", []) as string[],
  };
}

diagnosisRoutes.get("/:id/pdf", async (c) => {
  const userId = c.get("userId") as string;
  const params = SessionIdParam.safeParse({ id: c.req.param("id") });
  if (!params.success) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid session id");
  }

  // Ownership: a user may only export their OWN diagnosis. The D1 row is
  // the canonical owner check (customer_id === signed-in user).
  // diagnostic_sessions.id is TEXT (migration 0001); bind the id as a string
  // so the comparison matches regardless of D1's affinity coercion. Binding a
  // number fails to match a TEXT id column under the local D1 simulation.
  const session = await c.env.DB.prepare(
    "SELECT * FROM diagnostic_sessions WHERE id = ?1 AND customer_id = ?2",
  )
    .bind(params.data.id, Number(userId))
    .first<Record<string, unknown>>();
  if (!session) {
    return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  }

  const result = await c.env.DB.prepare(
    "SELECT * FROM diagnostic_results WHERE session_id = ?1",
  )
    .bind(Number(params.data.id))
    .first<Record<string, unknown>>();

  const playbook = playbookFromResult(result);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderDiagnosisPdf({
      sessionId: params.data.id,
      machineMake: (session.machine_make as string | null) ?? null,
      machineModel: (session.machine_model as string | null) ?? null,
      machineYear: (session.machine_year as string | null) ?? null,
      machineHours: (session.machine_hours as string | null) ?? null,
      symptoms: (session.symptoms as string | null) ?? null,
      faultCodes: (safeJson(session.fault_codes_input, []) as unknown[]).map(String),
      recentService: (safeJson(session.recent_service, []) as unknown[]).map(String),
      operatorNotes: (session.operator_notes as string | null) ?? null,
      modelUsed: (session.model_used as string | null) ?? null,
      generatedAt:
        (result?.generated_at as string | null) ??
        (session.started_at as string | null) ??
        null,
      possibleCauses: playbook.possible_causes as never,
      testsInOrder: playbook.tests_in_order as never,
      expectedReadings: playbook.expected_readings,
      partsLikelyNeeded: playbook.parts_likely_needed as never,
      safetyWarnings: (playbook.safety_warnings ?? []).map(String),
    });
  } catch (e) {
    log.error("diagnosis_pdf_render_failed", {
      requestId: c.get("requestId"),
      userId,
      sessionId: params.data.id,
      err: e instanceof Error ? e.message : String(e),
    });
    return jsonError(
      c,
      500,
      ErrorCode.Internal,
      "Could not render the diagnosis PDF.",
    );
  }

  const body = pdfBytes.slice().buffer;
  c.header("Content-Type", "application/pdf");
  c.header(
    "Content-Disposition",
    `attachment; filename="fixmyiron-diagnosis-${params.data.id}.pdf"`,
  );
  c.header("Content-Length", String(pdfBytes.byteLength));
  c.header("Cache-Control", "no-store");
  return c.body(body);
});
