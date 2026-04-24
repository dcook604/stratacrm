import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { bylawsApi, type Bylaw, type BylawCategory, type BylawListItem } from "../lib/api";

const CATEGORIES: { value: BylawCategory; label: string }[] = [
  { value: "noise", label: "Noise" },
  { value: "pets", label: "Pets" },
  { value: "parking", label: "Parking" },
  { value: "common_property", label: "Common Property" },
  { value: "rental", label: "Rental" },
  { value: "alterations", label: "Alterations" },
  { value: "move_in_out", label: "Move In/Out" },
  { value: "smoking", label: "Smoking" },
  { value: "nuisance", label: "Nuisance" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLOURS: Record<BylawCategory, string> = {
  noise: "badge-amber",
  pets: "badge-green",
  parking: "badge-blue",
  common_property: "badge-slate",
  rental: "badge-blue",
  alterations: "badge-amber",
  move_in_out: "badge-slate",
  smoking: "badge-red",
  nuisance: "badge-amber",
  other: "badge-slate",
};

function categoryLabel(c: BylawCategory): string {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

function occurrenceLabel(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 99) return "3rd+";
  return String(n);
}

// ---------------------------------------------------------------------------
// Bylaw form modal
// ---------------------------------------------------------------------------

interface BylawFormProps {
  initial?: Bylaw | null;
  onClose: () => void;
  onSaved: () => void;
}

function BylawFormModal({ initial, onClose, onSaved }: BylawFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    bylaw_number: initial?.bylaw_number ?? "",
    section: initial?.section ?? "",
    title: initial?.title ?? "",
    full_text: initial?.full_text ?? "",
    category: (initial?.category ?? "noise") as BylawCategory,
    active_from: initial?.active_from ?? new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      initial
        ? bylawsApi.update(initial.id, form)
        : bylawsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bylaws"] });
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  function field(name: keyof typeof form, label: string, type: "text" | "date" | "textarea" | "select") {
    if (type === "textarea") {
      return (
        <div key={name}>
          <label className="label">{label}</label>
          <textarea
            className="input min-h-[120px] resize-y"
            value={form[name]}
            onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          />
        </div>
      );
    }
    if (type === "select") {
      return (
        <div key={name}>
          <label className="label">{label}</label>
          <select
            className="input"
            value={form[name]}
            onChange={(e) => setForm({ ...form, [name]: e.target.value as BylawCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={name}>
        <label className="label">{label}</label>
        <input
          type={type}
          className="input"
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-2xl sm:mx-4 max-h-[80vh] flex flex-col sm:max-h-[80vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{initial ? "Edit Bylaw" : "New Bylaw"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("bylaw_number", "Bylaw Number", "text")}
            {field("section", "Section", "text")}
          </div>
          {field("title", "Title", "text")}
          {field("full_text", "Full Text", "textarea")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("category", "Category", "select")}
            {field("active_from", "Active From", "date")}
          </div>
        </div>
        <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !form.bylaw_number || !form.title || !form.full_text}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save Bylaw"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fine schedule management
// ---------------------------------------------------------------------------

function FineSchedulePanel({ bylaw }: { bylaw: Bylaw }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ occurrence_number: 1, fine_amount: "", continuing_contravention_amount: "", max_per_week: "" });
  const [error, setError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () =>
      bylawsApi.upsertFineSchedule(bylaw.id, {
        occurrence_number: form.occurrence_number,
        fine_amount: form.fine_amount,
        continuing_contravention_amount: form.continuing_contravention_amount || null,
        max_per_week: form.max_per_week || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bylaws", bylaw.id] });
      setAdding(false);
      setForm({ occurrence_number: 1, fine_amount: "", continuing_contravention_amount: "", max_per_week: "" });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: number) => bylawsApi.deleteFineSchedule(bylaw.id, scheduleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bylaws", bylaw.id] }),
  });

  const sorted = [...bylaw.fine_schedules].sort((a, b) => a.occurrence_number - b.occurrence_number);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fine Schedule</h4>
        <button onClick={() => setAdding(true)} className="text-xs btn btn-secondary py-1 px-2">
          <Plus className="w-3 h-3 inline mr-1" />Add / Replace
        </button>
      </div>
      {sorted.length === 0 && !adding && (
        <p className="text-sm text-slate-400 italic">No fine schedule set.</p>
      )}
      {sorted.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-500 border-b">
              <th className="text-left pb-1">Occurrence</th>
              <th className="text-left pb-1">Fine</th>
              <th className="text-left pb-1">Continuing</th>
              <th className="text-left pb-1">Max/Week</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((fs) => (
              <tr key={fs.id} className="border-b border-slate-100">
                <td className="py-1 font-medium">{occurrenceLabel(fs.occurrence_number)}</td>
                <td className="py-1">${Number(fs.fine_amount).toFixed(2)}</td>
                <td className="py-1 text-slate-500">
                  {fs.continuing_contravention_amount ? `$${Number(fs.continuing_contravention_amount).toFixed(2)}/day` : "—"}
                </td>
                <td className="py-1 text-slate-500">
                  {fs.max_per_week ? `$${Number(fs.max_per_week).toFixed(2)}/wk` : "—"}
                </td>
                <td className="py-1 text-right">
                  <button onClick={() => deleteMutation.mutate(fs.id)} className="text-slate-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <div className="mt-3 p-3 border rounded-md bg-slate-50 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Occurrence</label>
              <select
                className="input text-sm"
                value={form.occurrence_number}
                onChange={(e) => setForm({ ...form, occurrence_number: Number(e.target.value) })}
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
                <option value={99}>3rd+</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Fine Amount ($)</label>
              <input
                type="number" step="0.01" className="input text-sm"
                value={form.fine_amount}
                onChange={(e) => setForm({ ...form, fine_amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label text-xs">Continuing ($/day, optional)</label>
              <input
                type="number" step="0.01" className="input text-sm"
                value={form.continuing_contravention_amount}
                onChange={(e) => setForm({ ...form, continuing_contravention_amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label text-xs">Max/Week ($, optional)</label>
              <input
                type="number" step="0.01" className="input text-sm"
                value={form.max_per_week}
                onChange={(e) => setForm({ ...form, max_per_week: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn btn-secondary text-xs py-1 px-2">Cancel</button>
            <button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !form.fine_amount}
              className="btn btn-primary text-xs py-1 px-2"
            >
              {addMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable bylaw row
// ---------------------------------------------------------------------------

function BylawRow({ item, onEdit }: { item: BylawListItem; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: bylaw } = useQuery({
    queryKey: ["bylaws", item.id],
    queryFn: () => bylawsApi.get(item.id),
    enabled: expanded,
  });

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-4 py-3 font-mono text-sm text-slate-600">{item.bylaw_number}</td>
        <td className="px-4 py-3">
          <p className="font-medium text-sm">{item.title}</p>
          {item.section && <p className="text-xs text-slate-400">Section {item.section}</p>}
        </td>
        <td className="px-4 py-3">
          <span className={`badge ${CATEGORY_COLOURS[item.category]}`}>{categoryLabel(item.category)}</span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{item.active_from}</td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-slate-400 hover:text-blue-600 mr-2"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 inline text-slate-400" /> : <ChevronDown className="w-4 h-4 inline text-slate-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={5} className="px-6 py-4">
            {!bylaw ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="max-w-3xl">
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-4">
                  {bylaw.full_text}
                </p>
                <FineSchedulePanel bylaw={bylaw} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BylawsPage() {
  const [categoryFilter, setCategoryFilter] = useState<BylawCategory | "">("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editBylaw, setEditBylaw] = useState<Bylaw | null>(null);

  const { data: bylaws, isLoading } = useQuery({
    queryKey: ["bylaws", { categoryFilter, search, showInactive }],
    queryFn: () =>
      bylawsApi.list({
        category: categoryFilter || undefined,
        active_only: !showInactive,
        search: search || undefined,
      }),
  });

  async function openEdit(id: number) {
    const bylaw = await bylawsApi.get(id);
    setEditBylaw(bylaw);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-slate-900">Bylaw Library</h1>
          <p className="text-sm text-slate-500 mt-0.5">Versioned bylaw reference with fine schedules</p>
        </div>
        <button className="btn btn-primary self-start sm:self-auto" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">New Bylaw</span><span className="sm:hidden ml-1">New</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:flex-wrap sm:items-center">
        <input
          type="search"
          placeholder="Search bylaws…"
          className="input w-full sm:w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-44"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as BylawCategory | "")}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show superseded
        </label>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden -mx-4 sm:mx-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Bylaw #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Active From</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            )}
            {!isLoading && (!bylaws || bylaws.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No bylaws found.</td></tr>
            )}
            {bylaws?.map((b) => (
              <BylawRow key={b.id} item={b} onEdit={() => openEdit(b.id)} />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showForm && (
        <BylawFormModal
          initial={null}
          onClose={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}
      {editBylaw && (
        <BylawFormModal
          initial={editBylaw}
          onClose={() => setEditBylaw(null)}
          onSaved={() => setEditBylaw(null)}
        />
      )}
    </div>
  );
}
