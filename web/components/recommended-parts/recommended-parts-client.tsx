"use client";

import { useEffect, useState, FormEvent } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import { formatPriceUsd } from "@/lib/format";
import type { RecommendationsResponse } from "@/lib/types";

export function RecommendedPartsClient({
  initialSessionId,
}: {
  initialSessionId: string | null;
}) {
  const { call, ready } = useApi();
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? "");
  const [cartInput, setCartInput] = useState("");
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; hint?: string } | null>(null);

  // Auto-fire on mount if a session id was passed in the URL.
  useEffect(() => {
    if (initialSessionId && ready) {
      void run({ session_id: initialSessionId, cart_part_numbers: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, ready]);

  async function run(input: { session_id?: string; cart_part_numbers: string[] }) {
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (input.session_id) body.session_id = input.session_id;
      if (input.cart_part_numbers.length > 0)
        body.cart_part_numbers = input.cart_part_numbers;
      const r = await call<RecommendationsResponse>("/api/recommended-parts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setData(r);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError({ msg: ce?.message ?? "Failed to load recommendations.", hint: ce?.hint });
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cart = cartInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sessionId.trim()) {
      void run({ session_id: sessionId.trim(), cart_part_numbers: [] });
    } else if (cart.length > 0) {
      void run({ cart_part_numbers: cart });
    } else {
      setError({ msg: "Provide a session id or some part numbers.", hint: "Use a recent diagnosis session, or paste catalog PNs separated by commas." });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recommended Parts</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Sales-tone recommendations powered by Claude Opus 4.7. We
          cross-check every recommended part number against our 43k-row
          catalog before showing it — no fabricated parts.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="grid gap-3 rounded-md border border-equipment-700 bg-equipment-900/60 p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">
              Diagnosis session id
            </span>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="UUID from a previous /portal/diagnosis run"
              className={inputCls}
              aria-label="Diagnosis session id"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">
              …or part numbers (comma- or space-separated)
            </span>
            <input
              type="text"
              value={cartInput}
              onChange={(e) => setCartInput(e.target.value)}
              placeholder="1R-0750, 9V3405"
              className={inputCls}
              aria-label="Cart part numbers"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!ready || loading}
            className="rounded-md bg-accent px-5 py-2 font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating…" : "Get recommendations"}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 p-4">
          <p className="font-medium text-red-300">{error.msg}</p>
          {error.hint && <p className="mt-1 text-sm text-red-400">{error.hint}</p>}
        </div>
      )}

      {!data && !loading && !error && <EmptyState />}
      {loading && <LoadingState />}
      {data && <ResultsView data={data} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
      <p className="text-zinc-300">
        Run a diagnosis or paste part numbers to see what we recommend.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading recommendations" className="space-y-3">
      <div className="h-6 w-3/4 animate-pulse rounded bg-equipment-800" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-md border border-equipment-700 bg-equipment-900" />
        ))}
      </div>
    </div>
  );
}

function ResultsView({ data }: { data: RecommendationsResponse }) {
  return (
    <section className="space-y-6">
      <div className="rounded-md border-l-4 border-accent bg-equipment-900 p-5">
        <p className="text-lg font-semibold text-zinc-100">{data.hero_line}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.cards.map((c) => (
          <article
            key={c.part_number}
            className="flex flex-col rounded-md border border-equipment-700 bg-equipment-900 p-5"
          >
            <div className="aspect-[4/3] w-full rounded bg-equipment-800 ring-1 ring-equipment-700">
              {/* image placeholder — real images land with future R2 binding */}
              <div className="flex h-full items-center justify-center text-xs uppercase tracking-wider text-zinc-500">
                Part image
              </div>
            </div>
            <h3 className="mt-3 text-base font-semibold text-zinc-100">
              {c.name}
            </h3>
            <p className="mt-1 font-mono text-sm text-accent">
              <a
                href={`/portal/parts?q=${encodeURIComponent(c.part_number)}`}
                className="hover:underline"
              >
                {c.part_number}
              </a>
            </p>
            <p className="mt-2 flex-1 text-sm text-zinc-300">{c.why_you_need_it}</p>
            <div className="mt-4 flex items-end justify-between gap-3">
              <span className="text-lg font-semibold text-zinc-100">
                {formatPriceUsd(c.price_usd)}
              </span>
              <button
                type="button"
                onClick={() => {
                  // eslint-disable-next-line no-console
                  console.log("Add to inquiry:", c.part_number);
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
              >
                {c.cta_label}
              </button>
            </div>
          </article>
        ))}
      </div>

      {data.bundle_offer && (
        <section className="rounded-md border border-accent/60 bg-equipment-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-accent">{data.bundle_offer.label}</h2>
            <span className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">
              Save {formatPriceUsd(data.bundle_offer.bundle_savings_usd)}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{data.bundle_offer.rationale}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {data.bundle_offer.part_numbers.map((pn) => (
              <li
                key={pn}
                className="rounded-full border border-equipment-700 bg-equipment-800 px-3 py-1 font-mono text-accent"
              >
                {pn}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="rounded-md border border-equipment-700 bg-equipment-900/60 p-4 text-sm italic text-zinc-300">
        {data.urgency_framing}
      </p>
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-equipment-700 bg-equipment-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50";
