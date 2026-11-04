import { useDialog } from "../../hooks/useDialog";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { todayLocal } from "../../lib/dates";
import { lotLabel } from "../../lib/utils";
import { incidentsApi, lotsApi, type Incident, type IncidentStatus } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { COMMON_CATEGORIES, STATUS_LABELS, isCustomCategory } from "./constants";



// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

export interface IncidentFormProps {
  initial?: Incident | null;
  onClose: () => void;
  onSaved: () => void;
}


export function IncidentFormModal({ initial, onClose, onSaved }: IncidentFormProps) {
  const dialogRef = useDialog(onClose);
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
    incident_date: extractedDate || todayLocal(),
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
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      addToast("success", initial ? "Incident updated." : "Incident logged.");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  const isValid = form.incident_date && form.category.trim() && form.description.trim();

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-surface rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-xl sm:mx-4 max-h-[85vh] flex flex-col sm:max-h-[85vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{initial ? "Edit Incident" : "Log New Incident"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          {error && (
            <div role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
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
              <label className="label">Time <span className="text-slate-500 font-normal">(optional)</span></label>
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
                    {lotLabel(l)}
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
            <label className="label">Reported By <span className="text-slate-500 font-normal">(optional)</span></label>
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
                <label className="label">Resolution Notes <span className="text-slate-500 font-normal">(optional)</span></label>
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
