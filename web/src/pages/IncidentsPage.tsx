import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, FileText, ChevronDown, ChevronUp, Pencil, Upload, Trash2, Tag, AlertTriangle } from "lucide-react";
import { incidentsApi, lotsApi, documentsApi, type Incident, type IncidentStatus, type Document } from "../lib/api";
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
  "Other (custom)…",
];

function isCustomCategory(cat: string) {
  return !!cat && !COMMON_CATEGORIES.slice(0, -1).includes(cat);
}

function incidentRef(id: number) {
  return `INC-${String(id).padStart(4, "0")}`;
}

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

  const initialCategory = initial?.category ?? "";
  const startCustom = isCustomCategory(initialCategory);

  const [form, setForm] = useState({
    incident_date: initial?.incident_date ?? new Date().toISOString().slice(0, 10),
    lot_id: initial?.lot?.id ? String(initial.lot.id) : "",
    common_area_description: initial?.common_area_description ?? "",
    category: initialCategory,
    description: initial?.description ?? "",
    reported_by: initial?.reported_by ?? "",
    status: (initial?.status ?? "open") as IncidentStatus,
    resolution: initial?.resolution ?? "",
  });
  const [showCustom, setShowCustom] = useState(startCustom);
  const [lotSearch, setLotSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
  });

  const deleteMut = useMutation({
    mutationFn: () => incidentsApi.delete(initial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      addToast("success", `${incidentRef(initial!.id)} deleted.`);
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
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
              <select
                className="input"
                value={showCustom ? "Other (custom)…" : form.category}
                onChange={(e) => {
                  if (e.target.value === "Other (custom)…") {
                    setShowCustom(true);
                    setForm({ ...form, category: "" });
                  } else {
                    setShowCustom(false);
                    setForm({ ...form, category: e.target.value });
                  }
                }}
              >
                <option value="">Select category…</option>
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {showCustom && (
                <input
                  type="text"
                  className="input mt-1"
                  placeholder="Describe category…"
                  value={form.category}
                  autoFocus
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              )}
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

        <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-between gap-2 sm:gap-3">
          {/* Delete — only in edit mode */}
          <div className="flex items-center gap-2">
            {initial && !confirmDelete && (
              <button
                className="btn text-red-600 border border-red-200 hover:bg-red-50 text-sm flex items-center gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
            {initial && confirmDelete && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-700">Delete this incident?</span>
                <button
                  className="btn text-white bg-red-600 hover:bg-red-700 text-sm"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate()}
                >
                  {deleteMut.isPending ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  className="btn btn-secondary text-sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media attachment panel
// ---------------------------------------------------------------------------

function MediaPanel({ incidentId }: { incidentId: number }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: docs } = useQuery({
    queryKey: ["documents", "incident", incidentId],
    queryFn: () => documentsApi.list("incident", incidentId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => documentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "incident", incidentId] });
      setConfirmDelete(null);
      addToast("success", "Attachment removed.");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await documentsApi.upload("incident", incidentId, file, caption || undefined, tags || undefined);
      qc.invalidateQueries({ queryKey: ["documents", "incident", incidentId] });
      setCaption("");
      setTags("");
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = "";
      addToast("success", "Media uploaded.");
    } catch (e) {
      addToast("error", (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function isImage(doc: Document) {
    return doc.mime_type?.startsWith("image/") ?? false;
  }
  function isVideo(doc: Document) {
    return doc.mime_type?.startsWith("video/") ?? false;
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Media Attachments {docs && docs.length > 0 && `(${docs.length})`}
        </h4>
        <button
          className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
          onClick={() => setShowForm((f) => !f)}
        >
          <Upload className="w-3.5 h-3.5" />
          Add Photo / Video
        </button>
      </div>

      {showForm && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div>
            <label className="label text-xs">File (image or video, max 100 MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </div>
          <div>
            <label className="label text-xs">Caption <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              className="input text-sm"
              placeholder="Describe what's shown…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags <span className="text-slate-400 font-normal">(comma-separated, optional)</span>
            </label>
            <input
              type="text"
              className="input text-sm"
              placeholder="e.g. water, hallway, p2"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          {uploading && (
            <p className="text-xs text-blue-600 animate-pulse">Uploading…</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="btn btn-secondary text-xs py-1"
              onClick={() => { setShowForm(false); setCaption(""); setTags(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {docs && docs.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic">No media attached yet.</p>
      )}

      {docs && docs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {docs.map((doc) => (
            <div key={doc.id} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white">
              {isImage(doc) && (
                <a href={doc.download_url} target="_blank" rel="noreferrer">
                  <img
                    src={doc.download_url}
                    alt={doc.caption ?? doc.original_filename ?? ""}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                </a>
              )}
              {isVideo(doc) && (
                <video
                  src={doc.download_url}
                  controls
                  className="w-full h-32 object-cover bg-black"
                  preload="metadata"
                />
              )}
              {!isImage(doc) && !isVideo(doc) && (
                <a
                  href={doc.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center h-32 bg-slate-50 text-slate-400"
                >
                  <FileText className="w-8 h-8" />
                </a>
              )}

              {/* Caption + tags */}
              <div className="px-2 py-1.5 space-y-0.5">
                {doc.caption && (
                  <p className="text-xs text-slate-700 leading-tight line-clamp-2">{doc.caption}</p>
                )}
                {doc.tags && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {doc.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="inline-block text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete button */}
              <div className="absolute top-1 right-1">
                {confirmDelete === doc.id ? (
                  <div className="flex gap-1 bg-white rounded shadow-md p-1">
                    <button
                      className="text-[10px] text-red-600 font-semibold hover:underline"
                      onClick={() => deleteMut.mutate(doc.id)}
                      disabled={deleteMut.isPending}
                    >
                      Delete
                    </button>
                    <button
                      className="text-[10px] text-slate-500 hover:underline"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(doc.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded p-0.5 shadow text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
        <td className="px-4 py-3 font-mono text-sm text-slate-500">{incidentRef(incident.id)}</td>
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
            <div className="max-w-3xl space-y-3">
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
              <div className="flex items-center gap-2 flex-wrap">
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

              <MediaPanel incidentId={incident.id} />
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
