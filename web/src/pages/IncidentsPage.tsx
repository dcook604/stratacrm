import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, FileText, ChevronDown, ChevronUp, Pencil, AlertCircle } from "lucide-react";
import { incidentsApi, lotsApi, type Incident, type IncidentStatus } from "../lib/api";
import { useToast } from "../lib/toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLOURS: Record<IncidentStatus, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  resolved: "badge-green",
  closed: "badge-slate",
};

const COMMON_CATEGORIES = [
  "Water Damage", "Elevator", "Parkade", "Common Area Damage",
  "Security", "Fire Safety", "Garbage / Recycling", "Amenity Room",
  "Lobby / Entrance", "Roof / Exterior", "Suite Damage", "Noise",
  "Other",
];

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface IncidentFormProps {
  initial?: Incident | null;
  onClose: () => void;
  onSaved: () => void;
}

function IncidentFormModal({ initial, onClose, onSaved }: IncidentFormProps) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [form, setForm] = useState({
    incident_date: initial?.incident_date ?? new Date().toISOString().slice(0, 10),
    lot_id: initial?.lot?.id ? String(initial.lot.id) : "",
    common_area_description: initial?.common_area_description ?? "",
    category: initial?.category ?? "",
    description: initial?.description ?? "",
    reported_by: initial?.reported_by ?? "",
    status: (initial?.status ?? "open") as IncidentStatus,
    resolution: initial?.resolution ?? "",
  });
  const [lotSearch, setLotSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        incident_date: form.incident_date,
        lot_id: form.lot_id ? Number(form.lot_id) : null,
        common_area_description: form.common_area_description || null,
        category: form.category,
        description: form.description,
        reported_by: form.reported_by || null,
        ...(initial ? { status: form.status, resolution: form.resolution || null } : {}),
      };
      return initial
        ? incidentsApi.update(initial.id, payload)
        : incidentsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      addToast("success", initial ? "Incident updated." : "Incident logged.");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  const isValid = form.incident_date && form.category.trim() && form.description.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-xl sm:mx-4 max-h-[85vh] flex flex-col sm:max-h-[85vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{initial ? "Edit Incident" : "Log New Incident"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Incident Date *</label>
              <input
                type="date"
                className="input"
                value={form.incident_date}
                onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Category *</label>
              <input
                list="incident-categories"
                className="input"
                placeholder="Select or type…"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="incident-categories">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Location — lot or common area */}
          <div>
            <label className="label">Location</label>
            <div className="space-y-2">
              <input
                type="search"
                placeholder="Search strata lot…"
                className="input"
                value={lotSearch}
                onChange={(e) => setLotSearch(e.target.value)}
              />
              <select
                className="input"
                value={form.lot_id}
                onChange={(e) => setForm({ ...form, lot_id: e.target.value })}
              >
                <option value="">— common area / no specific lot —</option>
                {lotsData?.items.map((l) => (
                  <option key={l.id} value={l.id}>
                    SL{l.strata_lot_number}
                    {l.unit_number ? ` — Unit ${l.unit_number}` : ""}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="input"
                placeholder="Common area description (e.g. P1 parkade level 2)"
                value={form.common_area_description}
                onChange={(e) => setForm({ ...form, common_area_description: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Description *</label>
            <textarea
              className="input min-h-[90px] resize-y"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Reported By <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              className="input"
              value={form.reported_by}
              onChange={(e) => setForm({ ...form, reported_by: e.target.value })}
            />
          </div>

          {initial && (
            <>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as IncidentStatus })}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Resolution Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={form.resolution}
                  onChange={(e) => setForm({ ...form, resolution: e.target.value })}
                />
              </div>
            </>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !isValid}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : initial ? "Save Changes" : "Log Incident"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable incident row
// ---------------------------------------------------------------------------

function IncidentRow({ incident, onEdit }: { incident: Incident; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const quickStatus = useMutation({
    mutationFn: (status: IncidentStatus) => incidentsApi.update(incident.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });

  const locationLabel = incident.lot
    ? `SL${incident.lot.strata_lot_number}${incident.lot.unit_number ? ` Unit ${incident.lot.unit_number}` : ""}`
    : incident.common_area_description ?? "Common area";

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-4 py-3 font-mono text-sm text-slate-500">INC-{incident.id}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{incident.incident_date}</td>
        <td className="px-4 py-3 text-sm font-medium">{incident.category}</td>
        <td className="px-4 py-3 text-sm text-slate-500">{locationLabel}</td>
        <td className="px-4 py-3">
          <span className={`badge ${STATUS_COLOURS[incident.status]}`}>
            {STATUS_LABELS[incident.status]}
          </span>
        </td>
        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-slate-400 hover:text-blue-600"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={6} className="px-6 py-4">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{incident.description}</p>
              {incident.reported_by && (
                <p className="text-xs text-slate-500">Reported by: {incident.reported_by}</p>
              )}
              {incident.resolution && (
                <div className="border-l-2 border-green-400 pl-3">
                  <p className="text-xs font-semibold text-green-700 mb-0.5">Resolution</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{incident.resolution}</p>
                </div>
              )}
              {/* Quick status update */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Move to:</span>
                {(["open", "in_progress", "resolved", "closed"] as IncidentStatus[])
                  .filter((s) => s !== incident.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => quickStatus.mutate(s)}
                      disabled={quickStatus.isPending}
                      className="text-xs btn btn-secondary py-0.5 px-2"
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: IncidentStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [openOnly, setOpenOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editIncident, setEditIncident] = useState<Incident | null>(null);

  const { data: incidents, isLoading } = useQuery({
    queryKey: ["incidents", { statusFilter, openOnly }],
    queryFn: () =>
      incidentsApi.list({
        status: statusFilter || undefined,
        open_only: openOnly,
        limit: 200,
      }),
  });

  const activeCount = incidents?.filter((i) =>
    i.status === "open" || i.status === "in_progress"
  ).length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            Incidents
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Property and common area incident log
          </p>
        </div>
        <button className="btn btn-primary self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">Log Incident</span><span className="sm:hidden ml-1">New</span>
        </button>
      </div>

      {incidents && (
        <div className="flex gap-2 md:gap-4">
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-amber-600">{activeCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active</p>
          </div>
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-green-600">
              {incidents.filter((i) => i.status === "resolved").length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Resolved</p>
          </div>
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-slate-600">{incidents.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Showing</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select
          className="input w-44"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as IncidentStatus | "");
            if (e.target.value) setOpenOnly(false);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              if (e.target.checked) setStatusFilter("");
            }}
          />
          Active only
        </label>
      </div>

      <div className="card p-0 overflow-hidden -mx-4 sm:mx-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Ref</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Status</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && (!incidents || incidents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No incidents found.
                </td>
              </tr>
            )}
            {incidents?.map((inc) => (
              <IncidentRow
                key={inc.id}
                incident={inc}
                onEdit={() => setEditIncident(inc)}
              />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <IncidentFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editIncident && (
        <IncidentFormModal
          initial={editIncident}
          onClose={() => setEditIncident(null)}
          onSaved={() => setEditIncident(null)}
        />
      )}
    </div>
  );
}
