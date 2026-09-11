import { Hono } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { ensureOperationalSchema } from "../lib/ensure-schema";
import {
  getCustomerByAuthToken,
  insertRow,
  randomHex,
  selectAll,
  selectOne,
  camelizeRow,
  camelizeRows,
  type DbRow,
} from "../lib/d1-helpers";
import { complete } from "../lib/anthropic";
import { SYSTEM_PROMPT } from "../prompts/diagnosis";
import { log } from "../lib/log";
import { sendTransactionalEmail } from "../lib/email";
import { checkAndIncrement, WINDOW_MINUTE_MS } from "../lib/ratelimit";

export const liveSessionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function tokenFrom(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const legacy = c.req.header("x-auth-token");
  if (legacy) return legacy;
  const auth = c.req.header("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

function sessionAccess(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
  bodyAccess?: string;
}): string | null {
  return (
    c.bodyAccess ||
    c.req.header("x-session-token") ||
    c.req.query("accessToken") ||
    null
  );
}

async function loadOwnedSession(
  db: D1Database,
  id: string,
  accessToken?: string | null,
  customerId?: number,
) {
  const row = await selectOne<DbRow>(db, "SELECT * FROM sessions WHERE id = ?1", Number(id));
  if (!row) return null;
  const owner = row.customer_id ? Number(row.customer_id) : null;
  if (customerId && owner && owner !== customerId) return null;
  if (row.access_token) {
    if (accessToken && String(row.access_token) === accessToken) return row;
    if (customerId && owner === customerId) return row;
    return null;
  }
  if (customerId && owner && owner === customerId) return row;
  return null;
}

liveSessionRoutes.post("/", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const ip = c.req.header("cf-connecting-ip") || "anon";
  const rl = await checkAndIncrement({
    env: c.env,
    userId: ip,
    scope: "live-session-create",
    max: 20,
    windowMs: WINDOW_MINUTE_MS * 10,
  });
  if (!rl.ok) return jsonError(c, 429, ErrorCode.RateLimited, "Too many diagnostic sessions. Try again shortly.");

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const accessToken = randomHex(24);
  const id = await insertRow(c.env.DB, "sessions", {
    customer_id: customer ? Number(customer.id) : null,
    access_token: accessToken,
    language: typeof body.language === "string" ? body.language : "en",
    consent_given: body.consentGiven ? 1 : 0,
    agent_provider: "liveavatar",
    mechanic_type: typeof body.mechanicType === "string" ? body.mechanicType : "admin",
    status: "intake",
    customer_name: customer
      ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
      : null,
    customer_email: customer && typeof customer.email === "string" ? customer.email : null,
  });
  const row = await selectOne<DbRow>(c.env.DB, "SELECT * FROM sessions WHERE id = ?1", id);
  return c.json({ ...(camelizeRow(row) ?? {}), id, accessToken });
});

liveSessionRoutes.get("/", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  if (!customer) return jsonError(c, 401, ErrorCode.Unauthenticated, "Sign in required");
  const rows = await selectAll<DbRow>(
    c.env.DB,
    "SELECT * FROM sessions WHERE customer_id = ?1 ORDER BY id DESC LIMIT 50",
    Number(customer.id),
  );
  return c.json(camelizeRows(rows));
});

liveSessionRoutes.get("/:id", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess(c);
  const row = await loadOwnedSession(
    c.env.DB,
    c.req.param("id"),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!row) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  return c.json(camelizeRow(row));
});

liveSessionRoutes.post("/:id/message", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const ip = c.req.header("cf-connecting-ip") || "anon";
  const rl = await checkAndIncrement({
    env: c.env,
    userId: ip,
    scope: "live-session-message",
    max: 40,
    windowMs: WINDOW_MINUTE_MS * 10,
  });
  if (!rl.ok) return jsonError(c, 429, ErrorCode.RateLimited, "Too many messages. Try again shortly.");

  const sessionId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess({
    req: c.req,
    bodyAccess: typeof body.accessToken === "string" ? body.accessToken : undefined,
  });
  const session = await loadOwnedSession(
    c.env.DB,
    String(sessionId),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!session) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");

  const content = String(body.content ?? body.message ?? "").trim();
  if (!content) return jsonError(c, 400, ErrorCode.BadRequest, "Message content is required");

  const storedRole = body.skipAi === true && body.role === "assistant" ? "assistant" : "user";
  await insertRow(c.env.DB, "session_messages", {
    session_id: sessionId,
    role: storedRole,
    content,
    agent_type: typeof body.agentType === "string" ? body.agentType : "admin",
  });

  if (body.skipAi === true || content.startsWith("[")) {
    return c.json({ reply: "", role: storedRole, skipped: true });
  }

  if (!c.env.ANTHROPIC_API_KEY) {
    return jsonError(
      c,
      503,
      ErrorCode.Upstream,
      "The diagnosis engine is not configured.",
      "ANTHROPIC_API_KEY must be set on the API Worker.",
    );
  }

  const history = await selectAll<{ role: string; content: string }>(
    c.env.DB,
    "SELECT role, content FROM session_messages WHERE session_id = ?1 ORDER BY id DESC LIMIT 12",
    sessionId,
  );
  const turns = history.reverse().filter((turn) => !turn.content.startsWith("["));

  let reply: string;
  try {
    const result = await complete(c.env, {
      system:
        SYSTEM_PROMPT +
        "\nYou are on a live voice/text mechanic desk. Reply in 2-6 spoken sentences. Ask one follow-up if evidence is missing. Never invent CAT SIS or SIS2 data. If the caller should talk to a specialist, end with HANDOFF:heavy_equipment or HANDOFF:power_gen, HANDOFF:marine, HANDOFF:hydraulics, HANDOFF:electrical, HANDOFF:parts.",
      messages: turns.map((turn) => ({
        role: turn.role === "assistant" ? "assistant" : "user",
        content: turn.content,
      })),
      userId: session.customer_id ? String(session.customer_id) : undefined,
      maxTokens: 800,
      requestId: c.get("requestId"),
    });
    reply = result.text;
  } catch (err) {
    log.error("session_message_ai_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonError(
      c,
      502,
      ErrorCode.Upstream,
      "The diagnosis engine could not complete this turn. Try again.",
    );
  }

  const handoffMatch = reply.match(/HANDOFF:([a-z_]+)/i);
  const cleaned = reply.replace(/\s*HANDOFF:[a-z_]+\s*/gi, "").trim();

  await insertRow(c.env.DB, "session_messages", {
    session_id: sessionId,
    role: "assistant",
    content: cleaned,
    agent_type: typeof body.agentType === "string" ? body.agentType : "admin",
  });

  return c.json({
    reply: cleaned,
    role: "assistant",
    handoff: handoffMatch
      ? { type: "handoff", mechanicType: handoffMatch[1]!.toLowerCase() }
      : null,
  });
});

liveSessionRoutes.post("/:id/handoff", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess(c);
  const session = await loadOwnedSession(
    c.env.DB,
    c.req.param("id"),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!session) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  await c.env.DB.prepare(
    "UPDATE sessions SET mechanic_type = 'heavy_equipment', status = 'diagnosing' WHERE id = ?1",
  )
    .bind(Number(session.id))
    .run();
  return c.json({ ok: true });
});

liveSessionRoutes.get("/:id/report", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess(c);
  const session = await loadOwnedSession(
    c.env.DB,
    c.req.param("id"),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!session) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  const row = await selectOne<DbRow>(
    c.env.DB,
    "SELECT * FROM session_reports WHERE session_id = ?1 ORDER BY id DESC LIMIT 1",
    Number(c.req.param("id")),
  );
  if (!row) return jsonError(c, 404, ErrorCode.NotFound, "Report not found");
  return c.json(camelizeRow(row));
});

liveSessionRoutes.post("/:id/report", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess(c);
  const session = await loadOwnedSession(
    c.env.DB,
    c.req.param("id"),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!session) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  if (!c.env.ANTHROPIC_API_KEY) {
    return jsonError(c, 503, ErrorCode.Upstream, "The diagnosis engine is not configured.");
  }
  const history = await selectAll<{ role: string; content: string }>(
    c.env.DB,
    "SELECT role, content FROM session_messages WHERE session_id = ?1 ORDER BY id ASC LIMIT 40",
    Number(session.id),
  );
  if (history.length === 0) {
    return jsonError(c, 400, ErrorCode.BadRequest, "No conversation yet to summarize.");
  }
  try {
    const result = await complete(c.env, {
      system:
        SYSTEM_PROMPT +
        "\nWrite a structured diagnostic session report with likely causes, tests, safety warnings, and next steps. Use only evidence from the transcript.",
      messages: history.map((turn) => ({
        role: turn.role === "assistant" ? "assistant" : "user",
        content: turn.content,
      })),
      userId: session.customer_id ? String(session.customer_id) : undefined,
      maxTokens: 1600,
      requestId: c.get("requestId"),
    });
    const shareToken = randomHex(12);
    const id = await insertRow(c.env.DB, "session_reports", {
      session_id: Number(session.id),
      report_type: "diagnostic",
      content: result.text,
      share_token: shareToken,
    });
    return c.json({ id, content: result.text, shareToken, share_token: shareToken });
  } catch (err) {
    log.error("session_report_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonError(c, 502, ErrorCode.Upstream, "Could not generate a diagnostic report.");
  }
});

liveSessionRoutes.post("/:id/upload", async (c) => {
  return jsonError(
    c,
    503,
    ErrorCode.Upstream,
    "Session file upload is not enabled until the production R2 binding is confirmed writable.",
  );
});

liveSessionRoutes.post("/:id/email-transcript", async (c) => {
  const customer = await getCustomerByAuthToken(c.env.DB, tokenFrom(c));
  const access = sessionAccess(c);
  const session = await loadOwnedSession(
    c.env.DB,
    c.req.param("id"),
    access,
    customer ? Number(customer.id) : undefined,
  );
  if (!session) return jsonError(c, 404, ErrorCode.NotFound, "Session not found");
  const email =
    (typeof session.customer_email === "string" && session.customer_email) ||
    (customer && typeof customer.email === "string" ? customer.email : null);
  if (!email) {
    return jsonError(c, 400, ErrorCode.BadRequest, "No email is on this session.");
  }
  const history = await selectAll<{ role: string; content: string }>(
    c.env.DB,
    "SELECT role, content FROM session_messages WHERE session_id = ?1 ORDER BY id ASC LIMIT 80",
    Number(session.id),
  );
  const text = history.map((turn) => `${turn.role}: ${turn.content}`).join("\n\n");
  const sent = await sendTransactionalEmail(c, {
    to: email,
    subject: `FixMyIron session #${session.id} transcript`,
    text,
    html: `<pre>${text.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]!))}</pre>`,
  });
  if (!sent) return jsonError(c, 502, ErrorCode.Upstream, "Transcript email could not be sent.");
  return c.json({ ok: true });
});
