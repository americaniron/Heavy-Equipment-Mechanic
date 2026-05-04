"use client";

import { useEffect, useState } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import { formatPriceUsd } from "@/lib/format";
import type { RepairPlanData, RepairPlanResponse } from "@/lib/types";

export function RepairPlanClient({
  initialSessionId,
}: {
  initialSessionId: string | null;
}) {
  const { call, ready } = useApi();
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? "");
  const [plan, setPlan] = useState<RepairPlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; hint?: string } | null>(null);

  useEffect(() => {
    if (initialSessionId && ready) {
      void run(initialSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, ready]);

  async function run(id: string) {
    setError(null);
    setLoading(true);
    try {
      const r = await call<RepairPlanResponse>("/api/repair-plan", {
        method: "POST",
        body: JSON.stringify({ session_id: id }),
      });
      setPlan(r.plan);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError({ msg: ce?.message ?? "Failed to generate repair plan.", hint: ce?.hint });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Repair Plan</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Auto-generated from a structured diagnosis session.
          Free for any signed-in user.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (sessionId.trim()) void run(sessionId.trim());
        }}
        className="grid gap-3 rounded-md border border-equipment-700 bg-equipment-900/60 p-5"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-300">
            Diagnosis session id
          </span>
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="UUID from a previous /portal/diagnosis run"
            className="w-full rounded-md border border-equipment-700 bg-equipment-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
            aria-label="Diagnosis session id"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!ready || loading || !sessionId.trim()}
            className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate plan"}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 p-4">
          <p className="font-medium text-red-300">{error.msg}</p>
          {error.hint && <p className="mt-1 text-sm text-red-400">{error.hint}</p>}
        </div>
      )}

      {!plan && !loading && !error && (
        <EmptyState />
      )}

      {plan && <PlanView plan={plan} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
      <p className="text-zinc-300">
        Start a structured diagnosis to generate a repair plan.
      </p>
      <a
        href="/portal/diagnosis"
        className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
      >
        Run a diagnosis
      </a>
    </div>
  );
}

function PlanView({ plan }: { plan: RepairPlanData }) {
  return (
    <div className="space-y-6">
      {/* Top metrics */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Labor" value={`${plan.labor_hours_estimate.toFixed(1)} hr`} />
        <Metric
          label="Downtime"
          value={`${plan.downtime_days_projection.toFixed(plan.downtime_days_projection % 1 === 0 ? 0 : 1)} ${plan.downtime_days_projection === 1 ? "day" : "days"}`}
        />
        <Metric label="Parts cost" value={formatPriceUsd(plan.total_parts_cost_usd)} />
        <Metric
          label="Labor cost"
          value={`${formatPriceUsd(plan.total_labor_cost_usd_low)} – ${formatPriceUsd(plan.total_labor_cost_usd_high)}`}
        />
      </div>

      {/* Tools */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Required tools
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {plan.required_tools.map((t, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded border border-equipment-700 bg-equipment-900 px-3 py-2 text-sm text-zinc-200"
            >
              <input
                type="checkbox"
                aria-label={`Have ${t}`}
                className="h-4 w-4 rounded border-equipment-600 bg-equipment-800 accent-accent"
              />
              {t}
            </li>
          ))}
        </ul>
      </section>

      {/* Sequence */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
          Step-by-step sequence
        </h2>
        <ol className="space-y-3">
          {plan.suggested_sequence.map((s, i) => (
            <li
              key={i}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-zinc-100">
                  <span className="mr-2 text-accent">{i + 1}.</span>
                  {s.step}
                </p>
                <span className="shrink-0 rounded-full bg-equipment-800 px-2 py-0.5 text-xs text-zinc-300">
                  {s.time_min} min
                </span>
              </div>
              {s.prerequisites.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  Prerequisites: {s.prerequisites.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
