"use client";

import { useEffect, useState, FormEvent } from "react";
import { useApi, ApiCallError } from "@/lib/api";
import type {
  Equipment,
  EquipmentListResponse,
  EquipmentResponse,
} from "@/lib/types";

export function EquipmentClient() {
  const { call, ready } = useApi();
  const [list, setList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await call<EquipmentListResponse>("/api/equipment");
        if (!cancelled) setList(r.equipment);
      } catch (e) {
        const ce = e instanceof ApiCallError ? e : null;
        if (!cancelled) setError(ce?.message ?? "Failed to load equipment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, call]);

  async function add(input: Omit<Equipment, "id" | "user_id" | "created_at" | "updated_at">) {
    setError(null);
    try {
      const r = await call<EquipmentResponse>("/api/equipment", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setList((prev) => [r.equipment, ...prev]);
      setShowAdd(false);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError(ce?.message ?? "Failed to add equipment.");
    }
  }

  async function update(id: string, input: Partial<Equipment>) {
    setError(null);
    try {
      const r = await call<EquipmentResponse>(`/api/equipment/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setList((prev) =>
        prev.map((e) => (e.id === id ? r.equipment : e)),
      );
      setEditing(null);
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError(ce?.message ?? "Failed to update equipment.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this machine? Diagnoses tied to it will be unlinked.")) return;
    setError(null);
    try {
      await call(`/api/equipment/${id}`, { method: "DELETE" });
      setList((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      const ce = e instanceof ApiCallError ? e : null;
      setError(ce?.message ?? "Failed to delete equipment.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Equipment</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your fleet. Predictive maintenance uses this list plus your
            accumulated diagnosis history.
          </p>
        </div>
        {!showAdd && !editing && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg hover:bg-accent-hover"
          >
            + Add machine
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showAdd && (
        <EquipmentForm
          initial={null}
          onCancel={() => setShowAdd(false)}
          onSave={add}
        />
      )}

      {editing && (
        <EquipmentForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(v) => update(editing.id, v)}
        />
      )}

      {loading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : list.length === 0 && !showAdd ? (
        <div className="rounded-md border border-equipment-700 bg-equipment-900/60 p-8 text-center">
          <p className="text-zinc-300">
            No machines yet. Add one to start tracking.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((e) => (
            <li
              key={e.id}
              className="rounded-md border border-equipment-700 bg-equipment-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-100">
                    {e.make} {e.model}
                    {e.year ? <span className="ml-2 text-zinc-400">({e.year})</span> : null}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <div>
                      <dt className="uppercase tracking-wider">Hours</dt>
                      <dd className="text-zinc-200">{e.hours?.toLocaleString() ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wider">Serial</dt>
                      <dd className="text-zinc-200">{e.serial ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="rounded border border-equipment-600 px-2 py-1 text-xs text-zinc-200 hover:bg-equipment-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="rounded border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EquipmentForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: Equipment | null;
  onCancel: () => void;
  onSave: (
    v: Omit<Equipment, "id" | "user_id" | "created_at" | "updated_at">,
  ) => void;
}) {
  const [make, setMake] = useState(initial?.make ?? "Caterpillar");
  const [model, setModel] = useState(initial?.model ?? "");
  const [year, setYear] = useState(initial?.year?.toString() ?? "");
  const [hours, setHours] = useState(initial?.hours?.toString() ?? "");
  const [serial, setSerial] = useState(initial?.serial ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      make: make.trim(),
      model: model.trim(),
      year: year.trim() ? Number(year) : null,
      hours: hours.trim() ? Number(hours) : null,
      serial: serial.trim() || null,
    });
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-md border border-equipment-700 bg-equipment-900 p-5"
    >
      <h2 className="text-lg font-semibold text-zinc-100">
        {initial ? "Edit machine" : "Add machine"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Make" required>
          <input value={make} onChange={(e) => setMake(e.target.value)} required className={inputCls} />
        </Field>
        <Field label="Model" required>
          <input value={model} onChange={(e) => setModel(e.target.value)} required placeholder="e.g. 350G" className={inputCls} />
        </Field>
        <Field label="Year">
          <input type="number" min={1950} max={2100} value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Hours">
          <input type="number" min={0} max={200000} value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Serial">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-equipment-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-equipment-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {initial ? "Save" : "Add"}
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
