import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, FileText, ChevronDown, ChevronUp, Pencil, Upload, Trash2, Tag, AlertTriangle, Edit3, Mail, MessageSquare, Send, GitMerge } from "lucide-react";
import { fmtDatetime } from "../lib/dates";
import { incidentsApi, lotsApi, documentsApi, type Incident, type IncidentStatus, type Document, type EntityNote } from "../lib/api";
import { useToast } from "../lib/toast";
import ImageEditor from "../components/ImageEditor";
import Lightbox from "../components/Lightbox";
import SendIncidentEmailModal from "../components/SendIncidentEmailModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  pending_assignment: "Pending Assignment",
};

const STATUS_COLOURS: Record<IncidentStatus, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  resolved: "badge-green",
  closed: "badge-slate",
  pending_assignment: "badge-red",
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

  const initialDateRaw = initial?.incident_date ?? "";
  const hasTime = initialDateRaw.includes("T");
  const extractedDate = hasTime ? initialDateRaw.slice(0, 10) : initialDateRaw;
  const extractedTime = hasTime ? initialDateRaw.slice(11, 16) : "";
  const initialTimeVal = extractedTime && extractedTime !== "00:00" ? extractedTime : "";

  const [form, setForm] = useState({
    incident_date: extractedDate || new Date().toISOString().slice(0, 10),
    incident_time: initialTimeVal,
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

  // Auto-select lot when search yields exactly one match
  useEffect(() => {
    if (lotsData?.items.length === 1 && !form.lot_id) {
      const lot = lotsData.items[0];
      setForm((f) => ({ ...f, lot_id: String(lot.id) }));
    }
  }, [lotsData, form.lot_id]);

  const deleteMut = useMutation({
    mutationFn: () => incidentsApi.delete(initial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      addToast("success", `${initial!.reference} deleted.`);
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const incident_datetime = form.incident_time
        ? `${form.incident_date}T${form.incident_time}:00`
        : form.incident_date;
      const payload = {
        incident_date: incident_datetime,
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
              <label className="label">Time <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="time"
                className="input"
                value={form.incident_time}
                onChange={(e) => setForm({ ...form, incident_time: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
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
  const [uploadPct, setUploadPct] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Image editor state
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  // Lightbox state
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: docs } = useQuery({
    queryKey: ["documents", "incident", incidentId],
    queryFn: () => documentsApi.list("incident", incidentId),
    // Poll while any video is still being transcoded
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.is_processing) ? 3000 : false,
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

  async function uploadFile(file: File, cap?: string, t?: string) {
    setUploading(true);
    setUploadPct(0);
    try {
      await documentsApi.upload("incident", incidentId, file, cap || undefined, t || undefined, setUploadPct);
      qc.invalidateQueries({ queryKey: ["documents", "incident", incidentId] });
      addToast("success", "Media uploaded.");
    } catch (e) {
      addToast("error", (e as Error).message);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  // Handle raw file selection — open editor for images, upload directly for video/other
  function handleFileSelected(file: File) {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setEditingFile(file);
      setEditingUrl(url);
    } else {
      uploadFile(file, caption || undefined, tags || undefined);
      setCaption("");
      setTags("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Called when the image editor confirms an edited blob
  const handleEditorConfirm = useCallback(
    async (blob: Blob) => {
      const name = editingFile?.name ?? "edited.jpg";
      const file = new File([blob], name, { type: "image/jpeg" });
      await uploadFile(file, caption || undefined, tags || undefined);
      // Clean up
      if (editingUrl) URL.revokeObjectURL(editingUrl);
      setEditingFile(null);
      setEditingUrl(null);
      setCaption("");
      setTags("");
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    [editingFile, editingUrl, caption, tags, uploadFile],
  );

  function handleEditorCancel() {
    if (editingUrl) URL.revokeObjectURL(editingUrl);
    setEditingFile(null);
    setEditingUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function isImage(doc: Document) {
    return doc.mime_type?.startsWith("image/") ?? false;
  }
  function isVideo(doc: Document) {
    return doc.mime_type?.startsWith("video/") ?? false;
  }

  const images = docs?.filter(isImage) ?? [];
  const lightboxDoc = lightboxIdx !== null ? images[lightboxIdx] : null;

  // Re-upload a re-edited existing image
  const [reEditDoc, setReEditDoc] = useState<Document | null>(null);
  const [reEditUrl, setReEditUrl] = useState<string | null>(null);

  async function startReEdit(doc: Document) {
    // Fetch the full-resolution image for editing
    try {
      const res = await fetch(doc.download_url, { credentials: "same-origin" });
      const blob = await res.blob();
      setReEditDoc(doc);
      setReEditUrl(URL.createObjectURL(blob));
    } catch {
      addToast("error", "Could not load image for editing.");
    }
  }

  async function handleReEditConfirm(blob: Blob) {
    if (!reEditDoc) return;
    const file = new File([blob], reEditDoc.original_filename ?? "edited.jpg", { type: "image/jpeg" });
    await uploadFile(file, reEditDoc.caption ?? undefined, reEditDoc.tags ?? undefined);
    if (reEditUrl) URL.revokeObjectURL(reEditUrl);
    setReEditDoc(null);
    setReEditUrl(null);
  }

  function handleReEditCancel() {
    if (reEditUrl) URL.revokeObjectURL(reEditUrl);
    setReEditDoc(null);
    setReEditUrl(null);
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

      {showForm && !editingFile && !reEditDoc && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div>
            <label className="label text-xs">File (image or video — images max 100 MB, videos up to 2 GB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
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
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-blue-600">
                {uploadPct < 100 ? (
                  <>
                    <span>Uploading…</span>
                    <span>{uploadPct}%</span>
                  </>
                ) : (
                  <span className="animate-pulse">Processing video… this may take a minute</span>
                )}
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-150 ${uploadPct < 100 ? "bg-blue-500" : "bg-amber-500 animate-pulse"}`}
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
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

      {/* Image editor modal for new uploads */}
      {editingUrl && editingFile && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Edit Image
          </h5>
          <ImageEditor
            src={editingUrl}
            onConfirm={handleEditorConfirm}
            onCancel={handleEditorCancel}
          />
        </div>
      )}

      {/* Image editor for re-editing existing images */}
      {reEditUrl && reEditDoc && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Re-edit Image
          </h5>
          <ImageEditor
            src={reEditUrl}
            onConfirm={handleReEditConfirm}
            onCancel={handleReEditCancel}
          />
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
                <>
                  <img
                    src={doc.thumbnail_url ?? doc.download_url}
                    alt={doc.caption ?? doc.original_filename ?? ""}
                    className="w-full h-32 object-contain bg-slate-100 cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                    onClick={() => {
                      const imgIdx = images.findIndex((d) => d.id === doc.id);
                      if (imgIdx !== -1) setLightboxIdx(imgIdx);
                    }}
                  />
                  {/* Re-edit button (top-left) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); startReEdit(doc); }}
                    className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded p-0.5 shadow text-slate-400 hover:text-blue-600"
                    title="Re-edit image"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {isVideo(doc) && !doc.is_processing && (
                <video
                  src={doc.download_url}
                  controls
                  className="w-full h-32 object-cover bg-black"
                  preload="metadata"
                />
              )}
              {doc.is_processing && (
                <div className="w-full h-32 bg-slate-100 flex flex-col items-center justify-center gap-1.5 text-slate-500">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-[11px] font-medium">Processing…</span>
                </div>
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

      {/* Lightbox */}
      {lightboxDoc && lightboxIdx !== null && (
        <Lightbox
          src={lightboxDoc.download_url}
          caption={lightboxDoc.caption}
          onClose={() => setLightboxIdx(null)}
          onPrev={
            lightboxIdx > 0
              ? () => setLightboxIdx((i) => (i !== null ? i - 1 : null))
              : undefined
          }
          onNext={
            lightboxIdx < images.length - 1
              ? () => setLightboxIdx((i) => (i !== null ? i + 1 : null))
              : undefined
          }
          onDelete={() => deleteMut.mutate(lightboxDoc.id)}
          hasPrev={lightboxIdx > 0}
          hasNext={lightboxIdx < images.length - 1}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes / timeline panel
// ---------------------------------------------------------------------------

function NotesPanel({ incidentId }: { incidentId: number }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [text, setText] = useState("");

  const { data: notes } = useQuery<EntityNote[]>({
    queryKey: ["incident-notes", incidentId],
    queryFn: () => incidentsApi.listNotes(incidentId),
  });

  const addMut = useMutation({
    mutationFn: () => incidentsApi.addNote(incidentId, text.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-notes", incidentId] });
      setText("");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const delMut = useMutation({
    mutationFn: (noteId: number) => incidentsApi.deleteNote(incidentId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-notes", incidentId] }),
    onError: (e: Error) => addToast("error", e.message),
  });

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" />
        Updates {notes && notes.length > 0 && `(${notes.length})`}
      </h4>

      {notes && notes.length > 0 && (
        <div className="space-y-2 mb-3">
          {notes.map((note) => (
            <div key={note.id} className={`rounded-lg px-3 py-2.5 text-sm border ${note.source === "email" ? "bg-purple-50 border-purple-100" : "bg-white border-slate-200"}`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {note.source === "email" && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                    <Mail className="w-3 h-3" />Email
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">
                  {note.author_name || note.author_email || "Unknown"}
                </span>
                <span className="text-xs text-slate-400">{fmtDatetime(note.created_at)}</span>
                <button
                  className="ml-auto text-slate-300 hover:text-red-500 transition-colors"
                  title="Delete note"
                  disabled={delMut.isPending}
                  onClick={() => delMut.mutate(note.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          className="input text-sm flex-1 min-h-[60px] resize-y"
          placeholder="Add an update or note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
              e.preventDefault();
              addMut.mutate();
            }
          }}
        />
        <button
          className="btn btn-primary text-xs py-2 px-3 flex items-center gap-1.5 self-end"
          disabled={!text.trim() || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          <Send className="w-3.5 h-3.5" />
          {addMut.isPending ? "Saving…" : "Add"}
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Expandable incident row
// ---------------------------------------------------------------------------

function QuickAssignLot({ incident }: { incident: Incident }) {
  const qc = useQueryClient();
  const [lotSearch, setLotSearch] = useState(incident.raw_unit_hint ?? "");
  const [selectedLotId, setSelectedLotId] = useState("");

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
    enabled: lotSearch.length > 0,
  });

  const assignMutation = useMutation({
    mutationFn: () => incidentsApi.update(incident.id, { lot_id: Number(selectedLotId), status: "open" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        Unit not matched — assign manually
        {incident.raw_unit_hint && (
          <span className="ml-1 font-normal text-amber-700">
            (email mentioned: <span className="font-mono">{incident.raw_unit_hint}</span>)
          </span>
        )}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search lot…"
          className="input text-xs py-1 w-32"
          value={lotSearch}
          onChange={(e) => { setLotSearch(e.target.value); setSelectedLotId(""); }}
          onClick={(e) => e.stopPropagation()}
        />
        <select
          className="input text-xs py-1 flex-1 min-w-[160px]"
          value={selectedLotId}
          onChange={(e) => setSelectedLotId(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">— select lot —</option>
          {lotsData?.items.map((l) => (
            <option key={l.id} value={l.id}>
              SL{l.strata_lot_number}{l.unit_number ? ` — Unit ${l.unit_number}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={(e) => { e.stopPropagation(); assignMutation.mutate(); }}
          disabled={!selectedLotId || assignMutation.isPending}
          className="btn btn-primary text-xs py-1 px-3 disabled:opacity-40"
        >
          {assignMutation.isPending ? "Assigning…" : "Assign & Open"}
        </button>
      </div>
    </div>
  );
}

function IncidentRow({ incident, onEdit, initialExpanded, isSelected, onToggleSelect }: {
  incident: Incident;
  onEdit: () => void;
  initialExpanded?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (initialExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialExpanded]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const { addToast } = useToast();

  const quickStatus = useMutation({
    mutationFn: (status: IncidentStatus) => incidentsApi.update(incident.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => incidentsApi.delete(incident.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      addToast("success", `${incident.reference} deleted.`);
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const isPending = incident.status === "pending_assignment";

  const locationLabel = incident.lot
    ? `SL${incident.lot.strata_lot_number}${incident.lot.unit_number ? ` Unit ${incident.lot.unit_number}` : ""}`
    : isPending && incident.raw_unit_hint
      ? `Unit hint: ${incident.raw_unit_hint}`
      : incident.common_area_description ?? "Common area";

  return (
    <>
      <tr
        ref={rowRef}
        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${isPending ? "bg-amber-50/40" : ""} ${isSelected ? "bg-blue-50/60" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input[type=checkbox]")) return;
          setExpanded((x) => !x);
        }}
      >
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={!!isSelected}
            onChange={onToggleSelect}
          />
        </td>
        <td className="px-4 py-3 font-mono text-sm text-slate-500">{incident.reference}</td>
        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{fmtDatetime(incident.incident_date)}</td>
        <td className="px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-1.5">
            {incident.category}
            {incident.source === "email" && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"
                title={incident.reporter_email ?? "Via email"}>
                <Mail className="w-3 h-3" />Email
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{locationLabel}</td>
        <td className="px-4 py-3">
          <span className={`badge ${STATUS_COLOURS[incident.status]}`}>
            {STATUS_LABELS[incident.status]}
          </span>
        </td>
        <td className="px-4 py-3 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-700 font-medium whitespace-nowrap">Delete?</span>
              <button
                className="text-xs text-red-600 font-semibold hover:underline disabled:opacity-50"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                Yes
              </button>
              <button
                className="text-xs text-slate-500 hover:underline"
                onClick={() => setConfirmDelete(false)}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onEdit()}
                className="text-slate-400 hover:text-blue-600"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-slate-400 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {!confirmDelete && (
            <span onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }} className="cursor-pointer">
              {expanded
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={7} className="px-6 py-4">
            <div className="max-w-3xl space-y-3">
              {isPending && <QuickAssignLot incident={incident} />}
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{incident.description}</p>
              {incident.reported_by && (
                <p className="text-xs text-slate-500">Reported by: {incident.reported_by}</p>
              )}
              {incident.reporter_email && (
                <p className="text-xs text-slate-500">Reporter email: {incident.reporter_email}</p>
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

              {/* Email button */}
              <div className="pt-1">
                <button
                  className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1.5"
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email Report
                </button>
              </div>

              <NotesPanel incidentId={incident.id} />
              <MediaPanel incidentId={incident.id} />
            </div>
          </td>
        </tr>
      )}
      {emailOpen && (
        <SendIncidentEmailModal incident={incident} onClose={() => setEmailOpen(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Merge dialog
// ---------------------------------------------------------------------------

function MergeDialog({
  incidents,
  selectedIds,
  mergePrimaryId,
  onSetMergePrimaryId,
  onConfirm,
  onCancel,
  isPending,
}: {
  incidents: Incident[];
  selectedIds: Set<number>;
  mergePrimaryId: number | null;
  onSetMergePrimaryId: (id: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const selected = incidents.filter((i) => selectedIds.has(i.id));
  const firstInList = selected.length > 0 ? selected[0].id : null;
  const effectivePrimary = mergePrimaryId ?? firstInList;
  const primary = selected.find((i) => i.id === effectivePrimary);
  const otherCount = effectivePrimary ? selected.length - 1 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-slate-500" />
            Merge {selected.length} Incidents
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Select the primary incident — it will survive and absorb the others.
          </p>

          <div className="space-y-2">
            {selected.map((inc) => (
              <label
                key={inc.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  effectivePrimary === inc.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="merge-primary"
                  className="mt-0.5"
                  checked={effectivePrimary === inc.id}
                  onChange={() => onSetMergePrimaryId(inc.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-800">{inc.reference}</span>
                    <span className={`badge ${STATUS_COLOURS[inc.status]}`}>{STATUS_LABELS[inc.status]}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{inc.category}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {inc.lot
                      ? `SL${inc.lot.strata_lot_number}${inc.lot.unit_number ? ` Unit ${inc.lot.unit_number}` : ""}`
                      : inc.common_area_description || "Common area"}
                    {" · "}
                    {fmtDatetime(inc.incident_date)}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {effectivePrimary && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
              <p className="font-medium">What will happen</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside text-amber-700">
                <li>All notes from the other {otherCount} incident{otherCount !== 1 ? "s" : ""} will move to <strong>{primary?.reference}</strong>.</li>
                <li>Any linked issues will be reassigned to the primary incident.</li>
                <li>Media attachments will be consolidated under the primary.</li>
                <li>The other incident{otherCount !== 1 ? "s" : ""} will be marked as merged and hidden from the list.</li>
                <li>A timeline note will be added recording this merge.</li>
                <li className="font-semibold">This action cannot be undone.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button
            className="btn bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={!effectivePrimary || isPending}
            onClick={onConfirm}
          >
            {isPending ? "Merging…" : `Merge ${selected.length} Incidents`}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: IncidentStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function IncidentsPage() {
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open") ? Number(searchParams.get("open")) : null;
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [openOnly, setOpenOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editIncident, setEditIncident] = useState<Incident | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<number | null>(null);

  const qc2 = useQueryClient();
  const { addToast } = useToast();

  const mergeMut = useMutation({
    mutationFn: ({ primaryId, mergeIds }: { primaryId: number; mergeIds: number[] }) =>
      incidentsApi.merge(primaryId, mergeIds),
    onSuccess: () => {
      qc2.invalidateQueries({ queryKey: ["incidents"] });
      setSelectedIds(new Set());
      setMergeOpen(false);
      addToast("success", "Incidents merged.");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

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

  const pendingCount = incidents?.filter((i) => i.status === "pending_assignment").length ?? 0;

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
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {selectedIds.size >= 2 && (
            <button className="btn btn-secondary text-sm" onClick={() => { setMergeOpen(true); setMergePrimaryId(null); }}>
              <GitMerge className="w-4 h-4" />
              Merge {selectedIds.size} Selected
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">Log Incident</span><span className="sm:hidden ml-1">New</span>
          </button>
        </div>
      </div>

      {incidents && (
        <div className="flex gap-2 md:gap-4 flex-wrap">
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-amber-600">{activeCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active</p>
          </div>
          {pendingCount > 0 && (
            <button
              className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px] border-amber-300 hover:border-amber-400 transition-colors"
              onClick={() => setStatusFilter("pending_assignment")}
            >
              <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Needs Unit</p>
            </button>
          )}
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
              <th className="px-2 py-3 w-10">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={selectedIds.size > 0 && selectedIds.size === incidents?.filter((i) => i.status !== "pending_assignment").length}
                  onChange={() => {
                    if (selectedIds.size > 0) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(incidents?.filter((i) => i.status !== "pending_assignment").map((i) => i.id) ?? []));
                    }
                  }}
                />
              </th>
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
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && (!incidents || incidents.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  No incidents found.
                </td>
              </tr>
            )}
            {incidents?.map((inc) => (
              <IncidentRow
                key={inc.id}
                incident={inc}
                onEdit={() => setEditIncident(inc)}
                initialExpanded={inc.id === openId}
                isSelected={selectedIds.has(inc.id)}
                onToggleSelect={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(inc.id)) next.delete(inc.id);
                    else next.add(inc.id);
                    return next;
                  });
                }}
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

      {mergeOpen && incidents && selectedIds.size >= 2 && (
        <MergeDialog
          incidents={incidents}
          selectedIds={selectedIds}
          mergePrimaryId={mergePrimaryId}
          onSetMergePrimaryId={setMergePrimaryId}
          onConfirm={() => {
            const primaryId = mergePrimaryId ?? Array.from(selectedIds)[0];
            const mergeIds = Array.from(selectedIds).filter((id) => id !== primaryId);
            mergeMut.mutate({ primaryId, mergeIds });
          }}
          onCancel={() => { setMergeOpen(false); setMergePrimaryId(null); }}
          isPending={mergeMut.isPending}
        />
      )}
    </div>
  );
}
