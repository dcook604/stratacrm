import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit2, Check, X, Trash2 } from "lucide-react";
import { lotsApi, type Lot } from "../lib/api";
import { ROLE_LABELS, roleBadgeClass, formatDate } from "../lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lotId = Number(id);
  const qc = useQueryClient();

  const { data: lot, isLoading, error } = useQuery<Lot>({
    queryKey: ["lot", lotId],
    queryFn: () => lotsApi.get(lotId),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Lot>>({});

  const updateMut = useMutation({
    mutationFn: (body: Partial<Lot>) => lotsApi.update(lotId, body),
    onSuccess: (updated) => {
      qc.setQueryData(["lot", lotId], updated);
      qc.invalidateQueries({ queryKey: ["lots"] });
      setEditing(false);
      setForm({});
    },
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const deleteAssignmentMut = useMutation({
    mutationFn: (assignmentId: number) => lotsApi.deleteAssignment(lotId, assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lot", lotId] });
      setConfirmDeleteId(null);
    },
  });

  function startEdit() {
    if (!lot) return;
    setForm({
      unit_number: lot.unit_number ?? "",
      square_feet: lot.square_feet ?? undefined,
      parking_stalls: lot.parking_stalls ?? "",
      storage_lockers: lot.storage_lockers ?? "",
      bike_lockers: lot.bike_lockers ?? "",
      scooter_lockers: lot.scooter_lockers ?? "",
      notes: lot.notes ?? "",
    });
    setEditing(true);
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-48 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="p-8">
        <Link to="/lots" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Lots
        </Link>
        <p className="text-red-600">Lot not found.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link to="/lots" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Lots
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            SL{lot.strata_lot_number}
            {lot.unit_number && (
              <span className="ml-2 text-slate-500 font-mono text-lg">Unit {lot.unit_number}</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Last updated {formatDate(lot.updated_at)}
          </p>
        </div>
        {!editing ? (
          <button onClick={startEdit} className="btn-secondary">
            <Edit2 className="w-4 h-4" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => updateMut.mutate(form)}
              disabled={updateMut.isPending}
              className="btn-primary"
            >
              <Check className="w-4 h-4" />
              {updateMut.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setForm({}); }} className="btn-secondary">
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        )}
      </div>

      {updateMut.error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {(updateMut.error as Error).message}
        </div>
      )}

      {/* Details card */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Lot Details</h2>
        {editing ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unit Number</label>
              <input
                className="input"
                value={form.unit_number ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, unit_number: e.target.value }))}
                placeholder="e.g. 0802"
              />
            </div>
            <div>
              <label className="label">Square Feet</label>
              <input
                className="input"
                type="number"
                value={form.square_feet ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, square_feet: e.target.value as unknown as string }))
                }
              />
            </div>
            <div>
              <label className="label">Parking Stalls</label>
              <input
                className="input"
                value={form.parking_stalls ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, parking_stalls: e.target.value }))}
                placeholder="e.g. P1-042"
              />
            </div>
            <div>
              <label className="label">Storage Lockers</label>
              <input
                className="input"
                value={form.storage_lockers ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, storage_lockers: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Bike Lockers</label>
              <input
                className="input"
                value={form.bike_lockers ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, bike_lockers: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Scooter Lockers</label>
              <input
                className="input"
                value={form.scooter_lockers ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, scooter_lockers: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Unit Number" value={lot.unit_number} />
            <Field
              label="Square Feet"
              value={lot.square_feet ? Number(lot.square_feet).toLocaleString() + " sq ft" : null}
            />
            <Field label="Parking Stalls" value={lot.parking_stalls} />
            <Field label="Storage Lockers" value={lot.storage_lockers} />
            <Field label="Bike Lockers" value={lot.bike_lockers} />
            <Field label="Scooter Lockers" value={lot.scooter_lockers} />
            <div className="col-span-2">
              <Field label="Notes" value={lot.notes} />
            </div>
          </dl>
        )}
      </div>

      {/* Assignments */}
      <div className="card">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Current Assignments</h2>
        </div>
        {lot.current_assignments.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            No current assignments. Import the owner list to populate this lot.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lot.current_assignments.map((a) => (
              <li key={a.id} className="px-6 py-4 flex items-start gap-4">
                <span className={roleBadgeClass(a.role)}>{ROLE_LABELS[a.role]}</span>
                <div className="flex-1">
                  <Link
                    to={`/parties/${a.party.id}`}
                    className="font-medium text-blue-600 hover:underline text-sm"
                  >
                    {a.party.full_name}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">
                    {a.party.party_type}
                    {a.start_date && ` · From ${formatDate(a.start_date)}`}
                    {a.form_k_filed_date && ` · Form K: ${formatDate(a.form_k_filed_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {confirmDeleteId === a.id ? (
                    <>
                      <span className="text-xs text-slate-500">Remove?</span>
                      <button
                        onClick={() => deleteAssignmentMut.mutate(a.id)}
                        disabled={deleteAssignmentMut.isPending}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(a.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove assignment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
