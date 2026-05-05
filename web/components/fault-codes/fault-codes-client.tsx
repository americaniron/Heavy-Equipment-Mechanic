"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import { formatPriceUsd } from "@/lib/format";

interface SearchHit {
  code: string;
  description: string;
  severity: string | null;
}
interface DetailFree {
  code: string;
  description: string;
  severity: string | null;
  paid_fields_locked: true;
  upgrade_hint: string;
}
interface DetailPaid {
  code: string;
  description: string;
  severity: string | null;
  likely_causes: string[];
  repair_actions: string[];
  related_parts: Array<{ part_number: string; description: string; price_usd: number | null }>;
  source_url: string | null;
  last_refreshed: number;
  paid_fields_locked: false;
}
type Detail = DetailFree | DetailPaid;

function useDebounced<T>(v: T, delayMs: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), delayMs);
    return () => clearTimeout(id);
  }, [v, delayMs]);
  return d;
}

export function FaultCodesClient() {
  const { call, ready } = useApi();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial / on-search.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (debounced.trim().length >= 2) params.set("q", debounced.trim());
        const r = await call<{ results: SearchHit[] }>(
          `/api/fault-codes/search${params.toString() ? `?${params}` : ""}`,
        );
        if (!cancelled) setHits(r.results);
      } catch (e) {
        const ce = e instanceof ApiCallError ? e : null;
        if (!cancelled) setError(ce?.message ?? "Search failed.");
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, debounced, call]);

  async function loadDetail(code: string) {
    setError(null);
    setDetailLoading(true);
    setSelected(null);
    try {
      const r = await call<Detail>(`/api/fault-codes/${encodeURIComponent(code)}`);
      setSelected(r);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError(ce?.message ?? "Failed to load fault code detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fault Codes</h1>
        <p className="mt-1 text-sm text-zinc-400">
          SAE J1939 SPN/FMI lookups + curated CAT-specific codes.
          Full causes, repair actions, and related parts shown for paid plans
          (and currently unlocked for everyone while billing is in
          deferred mode).
        </p>
      </div>

      <label className="block">
        <span className="sr-only">Search fault codes</span>
        <input
          type="search"
          value={q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          placeholder="Search by code (e.g. SPN-110-FMI-3) or description (e.g. coolant temperature)"
          className="w-full rounded-md border border-equipment-700 bg-equipment-900 px-4 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
          aria-label="Search fault codes"
        />
      </label>

      {error && (
        <div role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <section
          aria-label="Search results"
          className="rounded-md border border-equipment-700 bg-equipment-900/60"
        >
          <header className="border-b border-equipment-700 px-3 py-2 text-xs uppercase tracking-wider text-zinc-400">
            {searchLoading ? "Searching…" : `${hits.length} result${hits.length === 1 ? "" : "s"}`}
          </header>
          <ul className="max-h-[60vh] overflow-y-auto">
            {hits.map((h) => (
              <li key={h.code}>
                <button
                  type="button"
                  onClick={() => loadDetail(h.code)}
                  className={`block w-full border-b border-equipment-800 px-3 py-2 text-left text-sm hover:bg-equipment-800 focus:outline-none focus-visible:bg-equipment-800 ${
                    selected?.code === h.code ? "bg-equipment-800" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-accent">{h.code}</span>
                    {h.severity && <SeverityBadge severity={h.severity} />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-zinc-200">{h.description}</p>
                </button>
              </li>
            ))}
            {hits.length === 0 && !searchLoading && (
              <li className="p-6 text-center text-sm text-zinc-500">
                No matches.
              </li>
            )}
          </ul>
        </section>

        <section aria-label="Fault code detail" className="space-y-3">
          {!selected && !detailLoading && (
            <p className="rounded-md border border-equipment-700 bg-equipment-900/60 p-6 text-center text-zinc-400">
              Select a code to see details.
            </p>
          )}
          {detailLoading && (
            <div className="h-32 animate-pulse rounded-md border border-equipment-700 bg-equipment-900" />
          )}
          {selected && <DetailView detail={selected} />}
        </section>
      </div>
    </div>
  );
}

function DetailView({ detail }: { detail: Detail }) {
  return (
    <div className="space-y-5 rounded-md border border-equipment-700 bg-equipment-900 p-5">
      <div>
        <p className="font-mono text-lg text-accent">{detail.code}</p>
        <p className="mt-1 text-zinc-100">{detail.description}</p>
        {detail.severity && (
          <div className="mt-2">
            <SeverityBadge severity={detail.severity} />
          </div>
        )}
      </div>

      {detail.paid_fields_locked ? (
        <div className="rounded-md border border-accent/60 bg-equipment-950 p-4">
          <p className="font-medium text-accent">{detail.upgrade_hint}</p>
          <a
            href="/pricing"
            className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
          >
            See pricing
          </a>
        </div>
      ) : (
        <>
          <Section title="Likely causes">
            <ul className="space-y-1 text-sm text-zinc-200">
              {detail.likely_causes.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </Section>

          <Section title="Repair actions">
            <ol className="space-y-1 text-sm text-zinc-200">
              {detail.repair_actions.map((a, i) => (
                <li key={i}>
                  <span className="mr-2 text-accent">{i + 1}.</span>
                  {a}
                </li>
              ))}
            </ol>
          </Section>

          {detail.related_parts.length > 0 && (
            <Section title="Related parts (catalog)">
              <ul className="grid gap-2 sm:grid-cols-2">
                {detail.related_parts.map((p) => (
                  <li
                    key={p.part_number}
                    className="rounded border border-equipment-700 bg-equipment-900/60 p-3"
                  >
                    <a
                      href={`/portal/parts?q=${encodeURIComponent(p.part_number)}`}
                      className="font-mono text-sm text-accent hover:underline"
                    >
                      {p.part_number}
                    </a>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-300">{p.description}</p>
                    <p className="mt-1 text-xs text-zinc-200">
                      {formatPriceUsd(p.price_usd)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.source_url && (
            <p className="text-xs text-zinc-500">
              Source:{" "}
              {detail.source_url.startsWith("http") ? (
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-zinc-300"
                >
                  {detail.source_url}
                </a>
              ) : (
                <span>{detail.source_url}</span>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const lvl = severity.toLowerCase();
  const styles =
    lvl === "high"
      ? "bg-red-900/40 text-red-300 ring-red-700/60"
      : lvl === "medium"
        ? "bg-amber-900/40 text-amber-300 ring-amber-700/60"
        : "bg-zinc-800 text-zinc-300 ring-equipment-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${styles}`}>
      {severity}
    </span>
  );
}
