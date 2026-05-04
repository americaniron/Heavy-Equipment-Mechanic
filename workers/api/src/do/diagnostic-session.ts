/**
 * DiagnosticSession — per-customer multi-turn diagnosis context.
 *
 * Keyed by {user_id}:{session_id} from the Worker. Stores:
 *   - turns: array of { role, content, ts }
 *   - meta: { equipment_id?, tier_at_creation, created_at }
 *
 * The product surface (next slice) will:
 *   - POST /portal/diagnosis to start or continue a session,
 *   - the Worker forwards turns through this DO so context survives reloads
 *     and avoids racing concurrent writes.
 *
 * In this slice the class is declared so the wrangler migration can register
 * it; no public methods are exercised yet beyond a health probe.
 */
import type { Env } from "../env";

interface Turn {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

interface Meta {
  equipmentId?: string;
  tierAtCreation: "free" | "pro" | "shop";
  createdAt: number;
}

export class DiagnosticSession implements DurableObject {
  private readonly state: DurableObjectState;
  // Held to satisfy the Workers DO contract; product-surface methods will use it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__do/health") {
      return Response.json({ ok: true, kind: "DiagnosticSession" });
    }
    if (url.pathname === "/__do/state" && request.method === "GET") {
      const meta = await this.state.storage.get<Meta>("meta");
      const turns = (await this.state.storage.get<Turn[]>("turns")) ?? [];
      return Response.json({ meta: meta ?? null, turnCount: turns.length });
    }
    return new Response("not found", { status: 404 });
  }
}
