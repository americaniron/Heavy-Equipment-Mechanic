/**
 * DiagnosticSession — per-customer multi-turn diagnosis context.
 *
 * Key shape (from the Worker): `${user_id}:${session_id}` so different
 * users can't collide on session ids. Stores:
 *   - meta: { equipmentId?, tierAtCreation, createdAt, mode, modelUsed }
 *   - turns: { role, content, ts }[]   — multi-turn chat history
 *   - playbook: ScenarioOutput | null  — last structured scenario output
 *   - input: ScenarioInput | null      — last scenario input (for repair-plan)
 *
 * All state is JSON-serializable. We deliberately do NOT use SQLite
 * inside the DO — the access patterns are key-value with no joins.
 *
 * Method dispatch is over fetch() with /__do/<verb> URLs to keep the
 * Worker→DO call protocol typed-by-route. Each handler returns JSON.
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
  mode: "scenario" | "chat" | "wizard";
  modelUsed?: string;
}

export class DiagnosticSession implements DurableObject {
  private readonly state: DurableObjectState;
  // Held to satisfy the Workers DO contract; future methods will use it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      switch (path) {
        case "/__do/health":
          return Response.json({ ok: true, kind: "DiagnosticSession" });
        case "/__do/state":
          return await this.getState();
        case "/__do/init":
          return await this.init(request);
        case "/__do/append-turn":
          return await this.appendTurn(request);
        case "/__do/set-playbook":
          return await this.setPlaybook(request);
        case "/__do/set-input":
          return await this.setInput(request);
        default:
          return new Response("not found", { status: 404 });
      }
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  private async getState(): Promise<Response> {
    const meta = await this.state.storage.get<Meta>("meta");
    const turns = (await this.state.storage.get<Turn[]>("turns")) ?? [];
    const playbook = await this.state.storage.get<unknown>("playbook");
    const input = await this.state.storage.get<unknown>("input");
    return Response.json({
      meta: meta ?? null,
      turns,
      playbook: playbook ?? null,
      input: input ?? null,
    });
  }

  private async init(request: Request): Promise<Response> {
    const body = (await request.json()) as Partial<Meta>;
    const existing = await this.state.storage.get<Meta>("meta");
    if (existing) {
      // Idempotent: don't blow away an existing session on re-init.
      return Response.json({ ok: true, alreadyInitialized: true, meta: existing });
    }
    const meta: Meta = {
      tierAtCreation: body.tierAtCreation ?? "free",
      createdAt: body.createdAt ?? Date.now(),
      mode: body.mode ?? "chat",
      ...(body.equipmentId !== undefined ? { equipmentId: body.equipmentId } : {}),
      ...(body.modelUsed !== undefined ? { modelUsed: body.modelUsed } : {}),
    };
    await this.state.storage.put("meta", meta);
    await this.state.storage.put("turns", []);
    return Response.json({ ok: true, meta });
  }

  private async appendTurn(request: Request): Promise<Response> {
    const t = (await request.json()) as Turn;
    const turns = (await this.state.storage.get<Turn[]>("turns")) ?? [];
    turns.push(t);
    // Cap history at 200 turns to bound DO storage growth.
    const capped = turns.length > 200 ? turns.slice(-200) : turns;
    await this.state.storage.put("turns", capped);
    return Response.json({ ok: true, turnCount: capped.length });
  }

  private async setPlaybook(request: Request): Promise<Response> {
    const body = await request.json();
    await this.state.storage.put("playbook", body);
    return Response.json({ ok: true });
  }

  private async setInput(request: Request): Promise<Response> {
    const body = await request.json();
    await this.state.storage.put("input", body);
    return Response.json({ ok: true });
  }
}
