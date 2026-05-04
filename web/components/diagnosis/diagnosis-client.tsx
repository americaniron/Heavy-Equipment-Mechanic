"use client";

import { useState, FormEvent } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import type {
  ChatResponse,
  ScenarioInputPayload,
  ScenarioResponse,
  ScenarioPlaybook,
  Likelihood,
} from "@/lib/types";

type Mode = "scenario" | "chat";

export function DiagnosisClient() {
  const { call, ready } = useApi();
  const [mode, setMode] = useState<Mode>("scenario");
  const [error, setError] = useState<{ msg: string; hint?: string; code?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [monthlyRemaining, setMonthlyRemaining] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Diagnosis Engine</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Powered by Claude Opus 4.7. Free tier: 3 chat diagnoses/month.
          Scenario engine (structured playbook + parts-likely-needed) requires
          Pro or Shop.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Diagnosis mode"
        className="inline-flex rounded-md border border-equipment-700 bg-equipment-900 p-1"
      >
        <ModeTab active={mode === "scenario"} onClick={() => setMode("scenario")}>
          Scenario (structured)
        </ModeTab>
        <ModeTab active={mode === "chat"} onClick={() => setMode("chat")}>
          Quick chat
        </ModeTab>
      </div>

      {monthlyRemaining !== null && (
        <p
          className="text-xs uppercase tracking-wider text-zinc-500"
          aria-live="polite"
        >
          {monthlyRemaining > 0
            ? `${monthlyRemaining} free diagnoses remaining this month`
            : "Free monthly limit reached — upgrade for unlimited"}
        </p>
      )}

      {error && (
        <ErrorPanel
          msg={error.msg}
          hint={error.hint}
          code={error.code}
          onDismiss={() => setError(null)}
        />
      )}

      {mode === "scenario" ? (
        <ScenarioForm
          ready={ready}
          submitting={submitting}
          onSubmit={async (input) => {
            setError(null);
            setSubmitting(true);
            try {
              const r = await call<ScenarioResponse>("/api/diagnosis/scenario", {
                method: "POST",
                body: JSON.stringify(input),
              });
              setScenarioResult(r);
              setMonthlyRemaining(r.monthly_remaining);
            } catch (e) {
              const ce = e instanceof ApiCallError ? e : null;
              setError({
                msg: ce?.message ?? "Diagnosis failed.",
                hint: ce?.hint,
                code: ce?.code,
              });
            } finally {
              setSubmitting(false);
            }
          }}
        />
      ) : (
        <ChatForm
          ready={ready}
          submitting={submitting}
          onSubmit={async (message) => {
            setError(null);
            setSubmitting(true);
            try {
              const r = await call<ChatResponse>("/api/diagnosis/chat", {
                method: "POST",
                body: JSON.stringify({ message }),
              });
              setChatResult(r);
              setMonthlyRemaining(r.monthly_remaining);
            } catch (e) {
              const ce = e instanceof ApiCallError ? e : null;
              setError({
                msg: ce?.message ?? "Chat failed.",
                hint: ce?.hint,
                code: ce?.code,
              });
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}

      {mode === "scenario" && scenarioResult && (
        <PlaybookView playbook={scenarioResult.playbook} sessionId={scenarioResult.session_id} />
      )}
      {mode === "chat" && chatResult && (
        <ChatReplyView reply={chatResult.reply} sessionId={chatResult.session_id} />
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-accent text-accent-fg"
          : "text-zinc-300 hover:text-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

function ErrorPanel(p: {
  msg: string;
  hint?: string;
  code?: string;
  onDismiss: () => void;
}) {
  const isUpgrade = p.code === "TIER_REQUIRED";
  return (
    <div
      role="alert"
      className={`rounded-md border p-4 ${
        isUpgrade
          ? "border-accent/60 bg-equipment-900"
          : "border-red-900/60 bg-red-950/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`font-medium ${
              isUpgrade ? "text-accent" : "text-red-300"
            }`}
          >
            {p.msg}
          </p>
          {p.hint && (
            <p
              className={`mt-1 text-sm ${
                isUpgrade ? "text-zinc-300" : "text-red-400"
              }`}
            >
              {p.hint}
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
        <button
          type="button"
          onClick={p.onDismiss}
          aria-label="Dismiss"
          className="text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ScenarioForm({
  ready,
  submitting,
  onSubmit,
}: {
  ready: boolean;
  submitting: boolean;
  onSubmit: (i: ScenarioInputPayload) => void | Promise<void>;
}) {
  const [make, setMake] = useState("Caterpillar");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [hours, setHours] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [faultCodes, setFaultCodes] = useState("");
  const [recentService, setRecentService] = useState("");
  const [operatorNotes, setOperatorNotes] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    onSubmit({
      machine_make: make.trim(),
      machine_model: model.trim(),
      year: year.trim() ? Number(year) : null,
      hours: hours.trim() ? Number(hours) : null,
      symptoms: symptoms.trim(),
      fault_codes: faultCodes
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      recent_service: recentService
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      operator_notes: operatorNotes.trim(),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 rounded-md border border-equipment-700 bg-equipment-900/60 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-4">
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
        <Field label="Year">
          <input
            type="number"
            min={1950}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Hours">
          <input
            type="number"
            min={0}
            max={200000}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Symptoms" required>
        <textarea
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          required
          rows={3}
          placeholder="Describe what's happening — what's slow, what's loud, what won't engage…"
          className={inputCls}
        />
      </Field>
      <Field label="Active fault codes (comma- or newline-separated)">
        <textarea
          value={faultCodes}
          onChange={(e) => setFaultCodes(e.target.value)}
          rows={2}
          placeholder="E197-2, E390-2"
          className={inputCls}
        />
      </Field>
      <Field label="Recent service (one per line)">
        <textarea
          value={recentService}
          onChange={(e) => setRecentService(e.target.value)}
          rows={2}
          placeholder="Hydraulic filter changed at 6300 hr"
          className={inputCls}
        />
      </Field>
      <Field label="Operator notes">
        <textarea
          value={operatorNotes}
          onChange={(e) => setOperatorNotes(e.target.value)}
          rows={2}
          placeholder="Anything unusual about the day, location, conditions…"
          className={inputCls}
        />
      </Field>
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Running diagnosis…" : "Run diagnosis"}
        </button>
      </div>
    </form>
  );
}

function ChatForm({
  ready,
  submitting,
  onSubmit,
}: {
  ready: boolean;
  submitting: boolean;
  onSubmit: (m: string) => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!message.trim() || submitting) return;
        onSubmit(message.trim());
      }}
      className="grid gap-3 rounded-md border border-equipment-700 bg-equipment-900/60 p-5"
    >
      <Field label="Describe the issue" required>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          placeholder="My CAT 350G is losing hydraulic pressure under load after running mud yesterday…"
          className={inputCls}
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Asking Claude…" : "Ask"}
        </button>
      </div>
    </form>
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

function PlaybookView({
  playbook,
  sessionId,
}: {
  playbook: ScenarioPlaybook;
  sessionId: string;
}) {
  return (
    <section className="space-y-6">
      {playbook.safety_warnings.length > 0 && (
        <div
          role="alert"
          className="rounded-md border-l-4 border-accent bg-equipment-900 p-4"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-accent">
            Safety warnings — read first
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-100">
            {playbook.safety_warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlaybookSection title="Possible causes">
        <ul className="space-y-3">
          {playbook.possible_causes.map((c, i) => (
            <li
              key={i}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-zinc-100">{c.cause}</p>
                <LikelihoodBadge value={c.likelihood} />
              </div>
              <p className="mt-2 text-sm text-zinc-300">{c.reasoning}</p>
            </li>
          ))}
        </ul>
      </PlaybookSection>

      <PlaybookSection title="Tests in order (cheapest first)">
        <ol className="space-y-3">
          {playbook.tests_in_order.map((t, i) => (
            <li
              key={i}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <p className="font-medium text-zinc-100">
                <span className="mr-2 text-accent">{i + 1}.</span>
                {t.test}
              </p>
              {t.tools.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  Tools: {t.tools.join(", ")}
                </p>
              )}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded bg-emerald-950/40 p-2 ring-1 ring-emerald-800/40">
                  <dt className="text-xs uppercase tracking-wider text-emerald-400">Pass</dt>
                  <dd className="text-emerald-100">{t.expected_reading_pass}</dd>
                </div>
                <div className="rounded bg-amber-950/40 p-2 ring-1 ring-amber-800/40">
                  <dt className="text-xs uppercase tracking-wider text-amber-400">Fail</dt>
                  <dd className="text-amber-100">{t.expected_reading_fail}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </PlaybookSection>

      {Object.keys(playbook.expected_readings).length > 0 && (
        <PlaybookSection title="Expected readings reference">
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(playbook.expected_readings).map(([k, v]) => (
              <div
                key={k}
                className="rounded border border-equipment-700 bg-equipment-900 p-3"
              >
                <dt className="text-xs uppercase tracking-wider text-zinc-500">
                  {k}
                </dt>
                <dd className="text-sm text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
        </PlaybookSection>
      )}

      {playbook.parts_likely_needed.length > 0 && (
        <PlaybookSection title="Parts likely needed">
          <div className="grid gap-3 sm:grid-cols-2">
            {playbook.parts_likely_needed.map((p, i) => (
              <article
                key={i}
                className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  {p.part_number ? (
                    <a
                      href={`/portal/parts?q=${encodeURIComponent(p.part_number)}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {p.part_number}
                    </a>
                  ) : (
                    <span className="font-mono text-zinc-500">(part # tbd)</span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium text-zinc-100">
                  {p.description}
                </p>
                <p className="mt-1 text-sm text-zinc-400">{p.why}</p>
              </article>
            ))}
          </div>
        </PlaybookSection>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <a
          href={`/portal/repair-plan?session=${sessionId}`}
          className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:bg-accent-hover"
        >
          Generate repair plan
        </a>
        <a
          href={`/portal/recommended-parts?session=${sessionId}`}
          className="rounded-md border border-equipment-600 bg-equipment-800 px-4 py-2 font-medium text-zinc-100 hover:bg-equipment-700"
        >
          Recommended parts
        </a>
      </div>
    </section>
  );
}

function ChatReplyView({ reply, sessionId }: { reply: string; sessionId: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
        Diagnosis
      </h2>
      <article className="whitespace-pre-wrap rounded-md border border-equipment-700 bg-equipment-900 p-5 text-zinc-100">
        {reply}
      </article>
      <p className="text-xs text-zinc-500">Session: {sessionId}</p>
    </section>
  );
}

function PlaybookSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LikelihoodBadge({ value }: { value: Likelihood }) {
  const styles: Record<Likelihood, string> = {
    high: "bg-red-900/40 text-red-300 ring-red-700/60",
    medium: "bg-amber-900/40 text-amber-300 ring-amber-700/60",
    low: "bg-zinc-800 text-zinc-300 ring-equipment-600",
  };
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${styles[value]}`}
    >
      {value}
    </span>
  );
}
