"use client";

import { useState, FormEvent } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import type {
  WizardResponse,
  WizardStartInput,
  WizardTurn,
} from "@/lib/types";

interface Exchange {
  question: string;
  reasoning: string;
  answer: string | null;
  suggestedAnswers: string[];
  turnNumber: number;
}

export function TroubleshootingClient() {
  const { call, ready } = useApi();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [maxTurns, setMaxTurns] = useState(12);
  const [conclusion, setConclusion] = useState<
    | (Extract<WizardTurn, { terminate: true }>["conclusion"] & { reasoning: string })
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ msg: string; hint?: string; code?: string } | null>(null);

  const turnsUsed = exchanges.length;
  const showStartForm = !sessionId;

  async function startWizard(input: WizardStartInput) {
    setError(null);
    setSubmitting(true);
    setExchanges([]);
    setConclusion(null);
    try {
      const r = await call<WizardResponse>("/api/troubleshooting/start", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setSessionId(r.session_id);
      setMaxTurns(r.max_turns);
      handleTurn(r.turn, r.turn_number);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError({ msg: ce?.message ?? "Wizard failed to start.", hint: ce?.hint, code: ce?.code });
    } finally {
      setSubmitting(false);
    }
  }

  async function answer(text: string) {
    if (!sessionId || submitting) return;
    setError(null);
    setSubmitting(true);
    setExchanges((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      return [...prev.slice(0, -1), { ...last, answer: text }];
    });
    try {
      const r = await call<WizardResponse>(
        `/api/troubleshooting/${sessionId}/answer`,
        {
          method: "POST",
          body: JSON.stringify({ answer: text }),
        },
      );
      handleTurn(r.turn, r.turn_number);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError({ msg: ce?.message ?? "Wizard failed.", hint: ce?.hint, code: ce?.code });
    } finally {
      setSubmitting(false);
    }
  }

  function handleTurn(turn: WizardTurn, turnNumber: number) {
    if (turn.terminate) {
      setConclusion({ ...turn.conclusion, reasoning: turn.reasoning });
      return;
    }
    setExchanges((prev) => [
      ...prev,
      {
        question: turn.question,
        reasoning: turn.reasoning,
        answer: null,
        suggestedAnswers: turn.suggested_answers,
        turnNumber,
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Guided Troubleshooting</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Step-by-step wizard. Powered by Claude Opus 4.7. One question at a
          time, up to {maxTurns} turns. Counts toward your monthly diagnosis
          quota.
        </p>
      </div>

      {error && <ErrorPanel msg={error.msg} hint={error.hint} code={error.code} />}

      {showStartForm ? (
        <StartForm
          ready={ready}
          submitting={submitting}
          onStart={startWizard}
        />
      ) : (
        <ConversationView
          exchanges={exchanges}
          turnsUsed={turnsUsed}
          maxTurns={maxTurns}
          submitting={submitting}
          conclusion={conclusion}
          onAnswer={answer}
          onReset={() => {
            setSessionId(null);
            setExchanges([]);
            setConclusion(null);
          }}
        />
      )}
    </div>
  );
}

function StartForm({
  ready,
  submitting,
  onStart,
}: {
  ready: boolean;
  submitting: boolean;
  onStart: (i: WizardStartInput) => void | Promise<void>;
}) {
  const [make, setMake] = useState("Caterpillar");
  const [model, setModel] = useState("");
  const [complaint, setComplaint] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    onStart({
      machine_make: make.trim(),
      machine_model: model.trim(),
      initial_complaint: complaint.trim(),
    });
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-md border border-equipment-700 bg-equipment-900/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Make" required>
          <input
            type="text"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            required
            className={inputCls}
          />
        </Field>
        <Field label="Model" required>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            placeholder="e.g. 350G"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="What's the issue?" required>
        <textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          required
          rows={3}
          placeholder="Slow boom raise after running mud yesterday…"
          className={inputCls}
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start wizard"}
        </button>
      </div>
    </form>
  );
}

function ConversationView({
  exchanges,
  turnsUsed,
  maxTurns,
  submitting,
  conclusion,
  onAnswer,
  onReset,
}: {
  exchanges: Exchange[];
  turnsUsed: number;
  maxTurns: number;
  submitting: boolean;
  conclusion:
    | { summary: string; confidence: "high" | "medium" | "low"; next_steps: string[]; safety_warnings: string[]; reasoning: string }
    | null;
  onAnswer: (s: string) => void | Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-xs uppercase tracking-wider text-zinc-500" aria-live="polite">
        Turn {Math.min(turnsUsed, maxTurns)} of {maxTurns}
      </p>

      <ol className="space-y-4">
        {exchanges.map((x, i) => (
          <li
            key={i}
            className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Question {x.turnNumber}
            </p>
            <p className="mt-1 text-zinc-100">{x.question}</p>
            <p className="mt-2 text-sm text-zinc-400">{x.reasoning}</p>
            {x.answer === null ? (
              <AnswerControls
                suggested={x.suggestedAnswers}
                disabled={submitting || conclusion !== null}
                onAnswer={onAnswer}
              />
            ) : (
              <p className="mt-3 rounded bg-equipment-800 px-3 py-2 text-sm text-zinc-200">
                <span className="mr-2 text-xs uppercase tracking-wider text-zinc-500">
                  You
                </span>
                {x.answer}
              </p>
            )}
          </li>
        ))}
      </ol>

      {conclusion && <ConclusionView c={conclusion} onReset={onReset} />}
    </div>
  );
}

function AnswerControls({
  suggested,
  disabled,
  onAnswer,
}: {
  suggested: string[];
  disabled: boolean;
  onAnswer: (s: string) => void | Promise<void>;
}) {
  const [custom, setCustom] = useState("");
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {suggested.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onAnswer(s)}
            className="rounded-full border border-equipment-600 bg-equipment-800 px-3 py-1 text-sm text-zinc-100 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!custom.trim() || disabled) return;
          onAnswer(custom.trim());
          setCustom("");
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Or type a custom answer…"
          disabled={disabled}
          className={`flex-1 ${inputCls}`}
          aria-label="Custom answer"
        />
        <button
          type="submit"
          disabled={!custom.trim() || disabled}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function ConclusionView({
  c,
  onReset,
}: {
  c: { summary: string; confidence: "high" | "medium" | "low"; next_steps: string[]; safety_warnings: string[]; reasoning: string };
  onReset: () => void;
}) {
  const confColor: Record<typeof c.confidence, string> = {
    high: "bg-emerald-900/40 text-emerald-300 ring-emerald-700/60",
    medium: "bg-amber-900/40 text-amber-300 ring-amber-700/60",
    low: "bg-zinc-800 text-zinc-300 ring-equipment-600",
  };
  return (
    <section className="space-y-4 rounded-md border border-accent/60 bg-equipment-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-accent">Conclusion</h2>
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${confColor[c.confidence]}`}
        >
          {c.confidence} confidence
        </span>
      </div>
      <p className="text-zinc-100">{c.summary}</p>
      <p className="text-sm text-zinc-400">{c.reasoning}</p>

      {c.safety_warnings.length > 0 && (
        <div className="rounded border-l-4 border-accent bg-equipment-950 p-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
            Safety
          </h3>
          <ul className="mt-1 space-y-1 text-sm text-zinc-100">
            {c.safety_warnings.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Next steps
        </h3>
        <ol className="mt-2 space-y-1 text-sm text-zinc-200">
          {c.next_steps.map((s, i) => (
            <li key={i}>
              <span className="mr-2 text-accent">{i + 1}.</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-equipment-600 bg-equipment-800 px-4 py-2 font-medium text-zinc-100 hover:bg-equipment-700"
        >
          Start a new wizard
        </button>
        <a
          href="/portal/parts"
          className="rounded-md border border-equipment-600 bg-equipment-800 px-4 py-2 font-medium text-zinc-100 hover:bg-equipment-700"
        >
          Search parts
        </a>
      </div>
    </section>
  );
}

function ErrorPanel({ msg, hint, code }: { msg: string; hint?: string; code?: string }) {
  const isUpgrade = code === "TIER_REQUIRED";
  return (
    <div
      role="alert"
      className={`rounded-md border p-4 ${
        isUpgrade
          ? "border-accent/60 bg-equipment-900"
          : "border-red-900/60 bg-red-950/40"
      }`}
    >
      <p className={`font-medium ${isUpgrade ? "text-accent" : "text-red-300"}`}>{msg}</p>
      {hint && (
        <p className={`mt-1 text-sm ${isUpgrade ? "text-zinc-300" : "text-red-400"}`}>
          {hint}
        </p>
      )}
      {isUpgrade && (
        <a
          href="/pricing"
          className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          See pricing
        </a>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-equipment-700 bg-equipment-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
    </label>
  );
}
