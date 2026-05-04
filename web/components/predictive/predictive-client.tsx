"use client";

import { useState } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import type { Prediction, PredictiveResponse } from "@/lib/types";

export function PredictiveClient() {
  const { call, ready } = useApi();
  const [data, setData] = useState<PredictiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await call<PredictiveResponse>("/api/predictive", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setData(r);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError(ce?.message ?? "Failed to load predictions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Predictive Maintenance</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Risk alerts and recommended actions based on your fleet plus
            accumulated diagnosis history. Generated on demand.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!ready || loading}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Generating…" : data ? "Regenerate" : "Generate predictions"}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!data && !loading && !error && <PreEmptyState />}

      {data && data.empty_state === "no_equipment" && (
        <EmptyAction
          msg={data.empty_message ?? "No machines yet."}
          ctaLabel="Add equipment"
          ctaHref="/portal/equipment"
        />
      )}

      {data && data.empty_state === "no_diagnoses" && (
        <EmptyAction
          msg={data.empty_message ?? "No diagnoses yet."}
          ctaLabel="Run a diagnosis"
          ctaHref="/portal/diagnosis"
        />
      )}

      {data && data.empty_state === null && data.predictions.length > 0 && (
        <PredictionsTimeline predictions={data.predictions} />
      )}
    </div>
  );
}

function PreEmptyState() {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
      <p className="text-zinc-300">Click "Generate predictions" to evaluate your fleet.</p>
    </div>
  );
}

function EmptyAction({
  msg,
  ctaLabel,
  ctaHref,
}: {
  msg: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
      <p className="text-zinc-200">{msg}</p>
      <a
        href={ctaHref}
        className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
      >
        {ctaLabel}
      </a>
    </div>
  );
}

function PredictionsTimeline({ predictions }: { predictions: Prediction[] }) {
  // Sort by risk_score desc — highest urgency first.
  const sorted = [...predictions].sort((a, b) => b.risk_score - a.risk_score);
  return (
    <ol className="space-y-3">
      {sorted.map((p) => (
        <li
          key={p.equipment_id}
          className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-zinc-100">
                {p.equipment.make} {p.equipment.model}
                {p.equipment.year ? <span className="ml-2 text-zinc-400">({p.equipment.year})</span> : null}
              </p>
              <p className="text-xs text-zinc-500">
                {p.equipment.hours !== null ? `${p.equipment.hours.toLocaleString()} hr` : "hours unknown"}
                {" · "}
                {p.based_on_diagnoses === 0
                  ? "no diagnosis history"
                  : `${p.based_on_diagnoses} diagnos${p.based_on_diagnoses === 1 ? "is" : "es"} weighed`}
              </p>
            </div>
            <RiskBadge score={p.risk_score} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Window">{p.predicted_failure_window}</Field>
            <Field label="Action">{p.recommended_action}</Field>
            <Field label="Confidence">{(p.confidence * 100).toFixed(0)}%</Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/portal/diagnosis`}
              className="rounded border border-equipment-600 bg-equipment-800 px-3 py-1 text-xs text-zinc-200 hover:bg-equipment-700"
            >
              Run diagnosis
            </a>
            <a
              href={`/portal/parts`}
              className="rounded border border-equipment-600 bg-equipment-800 px-3 py-1 text-xs text-zinc-200 hover:bg-equipment-700"
            >
              Search parts
            </a>
          </div>
        </li>
      ))}
    </ol>
  );
}

function RiskBadge({ score }: { score: number }) {
  const tier =
    score >= 70 ? "red" : score >= 40 ? "amber" : "green";
  const styles: Record<typeof tier, string> = {
    red: "bg-red-900/40 text-red-300 ring-red-700/60",
    amber: "bg-amber-900/40 text-amber-300 ring-amber-700/60",
    green: "bg-emerald-900/40 text-emerald-300 ring-emerald-700/60",
  };
  return (
    <span
      className={`shrink-0 rounded-md px-3 py-1 text-sm font-semibold ring-1 ${styles[tier]}`}
      aria-label={`Risk score ${score} of 100`}
    >
      Risk {score}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-equipment-700 bg-equipment-900/60 p-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-100">{children}</p>
    </div>
  );
}
