"use client";

import {
  ChangeEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApi, ApiCallError } from "@/lib/api";
import { formatPriceUsd, stockBadge } from "@/lib/format";
import type {
  Part,
  PartsFacetsResponse,
  PartsSearchResponse,
} from "@/lib/types";

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;
const MIN_Q_CHARS = 2;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

interface SearchState {
  q: string;
  make: string;
  category: string;
}

export function PartsClient() {
  const { call, ready } = useApi();
  const [state, setState] = useState<SearchState>({
    q: "",
    make: "",
    category: "",
  });
  const debounced = useDebounced(state, DEBOUNCE_MS);

  const [facets, setFacets] = useState<PartsFacetsResponse | null>(null);
  const [results, setResults] = useState<Part[]>([]);
  const [totalEstimate, setTotalEstimate] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ msg: string; hint?: string } | null>(
    null,
  );

  // Cancel in-flight searches when a newer query supersedes them.
  const inFlight = useRef(0);

  const queryActive = debounced.q.trim().length >= MIN_Q_CHARS;

  // Load facets once after auth resolves.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await call<PartsFacetsResponse>("/api/parts/facets");
        if (!cancelled) setFacets(r);
      } catch {
        // Non-fatal: filters degrade to text-input fallback (still searchable).
        if (!cancelled) setFacets({ makes: [], categories: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, call]);

  // Run the (first-page) search whenever debounced state changes.
  useEffect(() => {
    if (!ready) return;
    if (!queryActive) {
      setResults([]);
      setTotalEstimate(0);
      setCursor(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ticket = ++inFlight.current;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({
          q: debounced.q.trim(),
          limit: String(PAGE_SIZE),
        });
        if (debounced.make) params.set("make", debounced.make);
        if (debounced.category) params.set("category", debounced.category);
        const r = await call<PartsSearchResponse>(
          `/api/parts/search?${params}`,
        );
        if (ticket !== inFlight.current) return; // superseded
        setResults(r.results);
        setTotalEstimate(r.total_estimate);
        setCursor(r.next_cursor);
      } catch (e) {
        if (ticket !== inFlight.current) return;
        const ce = e instanceof ApiCallError ? e : null;
        setError({
          msg: ce?.message ?? "Something went wrong loading results.",
          hint: ce?.hint,
        });
        setResults([]);
        setCursor(null);
      } finally {
        if (ticket === inFlight.current) setLoading(false);
      }
    })();
  }, [
    ready,
    queryActive,
    debounced.q,
    debounced.make,
    debounced.category,
    call,
  ]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        q: debounced.q.trim(),
        limit: String(PAGE_SIZE),
        cursor,
      });
      if (debounced.make) params.set("make", debounced.make);
      if (debounced.category) params.set("category", debounced.category);
      const r = await call<PartsSearchResponse>(`/api/parts/search?${params}`);
      setResults((prev) => prev.concat(r.results));
      setCursor(r.next_cursor);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError({
        msg: ce?.message ?? "Couldn't load more results.",
        hint: ce?.hint,
      });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, debounced, call]);

  const onChangeQ = (e: ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, q: e.target.value }));
  const onChangeMake = (e: ChangeEvent<HTMLSelectElement>) =>
    setState((s) => ({ ...s, make: e.target.value }));
  const onChangeCategory = (e: ChangeEvent<HTMLSelectElement>) =>
    setState((s) => ({ ...s, category: e.target.value }));

  const headerCount = useMemo(() => {
    if (!queryActive) return null;
    if (loading && results.length === 0) return "Searching…";
    if (totalEstimate > 0)
      return `Showing ${results.length.toLocaleString()} of ~${totalEstimate.toLocaleString()} results`;
    return `${results.length.toLocaleString()} results`;
  }, [queryActive, loading, results.length, totalEstimate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Parts</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Search 43,000+ parts across Caterpillar and Costex inventories.
        </p>
      </div>

      <SearchControls
        q={state.q}
        make={state.make}
        category={state.category}
        facets={facets}
        onChangeQ={onChangeQ}
        onChangeMake={onChangeMake}
        onChangeCategory={onChangeCategory}
      />

      {headerCount && (
        <p
          className="text-xs uppercase tracking-wider text-zinc-400"
          aria-live="polite"
        >
          {headerCount}
        </p>
      )}

      {error && <ErrorState msg={error.msg} hint={error.hint} />}

      {!queryActive && !error && <EmptyState />}

      {queryActive && !error && (
        <ResultsView
          rows={results}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={cursor !== null}
          onLoadMore={loadMore}
        />
      )}
    </div>
  );
}

interface SearchControlsProps {
  q: string;
  make: string;
  category: string;
  facets: PartsFacetsResponse | null;
  onChangeQ: (e: ChangeEvent<HTMLInputElement>) => void;
  onChangeMake: (e: ChangeEvent<HTMLSelectElement>) => void;
  onChangeCategory: (e: ChangeEvent<HTMLSelectElement>) => void;
}
function SearchControls(p: SearchControlsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
      <label className="block">
        <span className="sr-only">Search parts</span>
        <input
          type="search"
          value={p.q}
          onChange={p.onChangeQ}
          autoComplete="off"
          inputMode="search"
          placeholder="Search by part number or description (e.g. hydraulic pump)"
          aria-label="Search parts"
          className="w-full rounded-md border border-equipment-700 bg-equipment-900 px-4 py-2 text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </label>
      <label className="block">
        <span className="sr-only">Filter by make</span>
        <select
          value={p.make}
          onChange={p.onChangeMake}
          aria-label="Filter by make"
          className="w-full rounded-md border border-equipment-700 bg-equipment-900 px-3 py-2 text-zinc-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50 sm:w-40"
        >
          <option value="">All makes</option>
          {(p.facets?.makes ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Filter by category</span>
        <select
          value={p.category}
          onChange={p.onChangeCategory}
          aria-label="Filter by category"
          className="w-full rounded-md border border-equipment-700 bg-equipment-900 px-3 py-2 text-zinc-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50 sm:w-56"
        >
          <option value="">All categories</option>
          {(p.facets?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
      <p className="text-zinc-300">
        Search 43,000+ parts across Caterpillar and Costex inventories.
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Try{" "}
        <span className="rounded bg-equipment-800 px-1.5 py-0.5 font-mono text-zinc-300">
          hydraulic pump
        </span>{" "}
        or a part number.
      </p>
    </div>
  );
}

function ErrorState({ msg, hint }: { msg: string; hint?: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-900/60 bg-red-950/40 p-4"
    >
      <p className="font-medium text-red-300">{msg}</p>
      {hint && <p className="mt-1 text-sm text-red-400">{hint}</p>}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 rounded-md bg-red-900/60 px-3 py-1.5 text-sm font-medium text-red-200 hover:bg-red-900"
      >
        Retry
      </button>
    </div>
  );
}

interface ResultsViewProps {
  rows: Part[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}
function ResultsView(p: ResultsViewProps) {
  if (p.loading && p.rows.length === 0) return <LoadingSkeleton />;
  if (p.rows.length === 0) {
    return (
      <p className="rounded-md border border-equipment-700 bg-equipment-900/60 p-6 text-center text-zinc-400">
        No parts match this search.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-md border border-equipment-700 md:block">
        <table className="w-full text-sm">
          <thead className="bg-equipment-900 text-left text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th scope="col" className="px-3 py-2">Part #</th>
              <th scope="col" className="px-3 py-2">Description</th>
              <th scope="col" className="px-3 py-2">Make</th>
              <th scope="col" className="px-3 py-2">Category</th>
              <th scope="col" className="px-3 py-2 text-right">Price</th>
              <th scope="col" className="px-3 py-2">Stock</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-equipment-800">
            {p.rows.map((r) => {
              const sb = stockBadge(r.stock_status);
              return (
                <tr key={r.id} className="hover:bg-equipment-900/60">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-accent">
                    {r.part_number}
                  </td>
                  <td className="px-3 py-2 text-zinc-200">
                    <span className="line-clamp-2">{r.description}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-300">
                    {r.make}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                    {r.category ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-200">
                    {formatPriceUsd(r.price_usd)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${sb.className}`}
                    >
                      {sb.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <AddToInquiryButton part={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul
        className="space-y-3 md:hidden"
        aria-label="Parts search results (mobile view)"
      >
        {p.rows.map((r) => {
          const sb = stockBadge(r.stock_status);
          return (
            <li
              key={r.id}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-accent">{r.part_number}</span>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs ${sb.className}`}
                >
                  {sb.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-200">
                <span className="line-clamp-3">{r.description}</span>
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                <div>
                  <dt className="uppercase tracking-wider">Make</dt>
                  <dd className="text-zinc-200">{r.make}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider">Category</dt>
                  <dd className="text-zinc-200">{r.category ?? "—"}</dd>
                </div>
                <div className="text-right">
                  <dt className="uppercase tracking-wider">Price</dt>
                  <dd className="text-zinc-200">{formatPriceUsd(r.price_usd)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <AddToInquiryButton part={r} />
              </div>
            </li>
          );
        })}
      </ul>

      {p.hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={p.onLoadMore}
            disabled={p.loadingMore}
            className="rounded-md border border-equipment-600 bg-equipment-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-equipment-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p.loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function AddToInquiryButton({ part }: { part: Part }) {
  return (
    <button
      type="button"
      onClick={() => {
        // Cart state lands in a later slice. For now, surface intent so the
        // wiring is testable end-to-end.
        // eslint-disable-next-line no-console
        console.log("Add to inquiry:", part.part_number, part);
      }}
      className="inline-flex items-center rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      Add to Inquiry
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-label="Loading search results"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Fragment key={i}>
          <div className="hidden h-12 animate-pulse rounded-md border border-equipment-700 bg-equipment-900 md:block" />
          <div className="h-32 animate-pulse rounded-md border border-equipment-700 bg-equipment-900 md:hidden" />
        </Fragment>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
