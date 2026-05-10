import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit2, Check, X, Trash2 } from "lucide-react";
import { partiesApi, type Party, type ContactMethodType } from "../lib/api";
import { ROLE_LABELS, roleBadgeClass, formatDate, PARTY_TYPE_LABELS } from "../lib/utils";

const CM_LABELS: Record<ContactMethodType, string> = {
  email: "Email",
  home_phone: "Home",
  cell_phone: "Cell",
  work_phone: "Work",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export default function PartyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const partyId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: party, isLoading, error } = useQuery<Party>({
    queryKey: ["party", partyId],
    queryFn: () => partiesApi.get(partyId),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Party>>({});

  const updateMut = useMutation({
    mutationFn: (body: Partial<Party>) => partiesApi.update(partyId, body),
    onSuccess: (updated) => {
      qc.setQueryData(["party", partyId], updated);
      qc.invalidateQueries({ queryKey: ["parties"] });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => partiesApi.delete(partyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      navigate("/parties");
    },
  });

  const delCmMut = useMutation({
    mutationFn: (cmId: number) => partiesApi.deleteContactMethod(partyId, cmId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["party", partyId] }),
  });

  function startEdit() {
    if (!party) return;
    setForm({
      full_name: party.full_name,
      party_type: party.party_type,
      is_property_manager: party.is_property_manager,
      mailing_address_line1: party.mailing_address_line1 ?? "",
      mailing_address_line2: party.mailing_address_line2 ?? "",
      mailing_city: party.mailing_city ?? "",
      mailing_province: party.mailing_province ?? "",
      mailing_postal_code: party.mailing_postal_code ?? "",
      notes: party.notes ?? "",
    });
    setEditing(true);
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="p-4 sm:p-8">
        <Link to="/parties" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <p className="text-red-600">Party not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <Link to="/parties" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Parties
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{party.full_name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {PARTY_TYPE_LABELS[party.party_type]}
            {party.is_property_manager && " · Property Manager"}
            {" · Added "}{formatDate(party.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <button onClick={startEdit} className="btn-secondary">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${party.full_name}? This cannot be undone.`)) {
                    deleteMut.mutate();
                  }
                }}
                disabled={deleteMut.isPending}
                className="btn-danger"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {(updateMut.error || deleteMut.error) && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {((updateMut.error || deleteMut.error) as Error).message}
        </div>
      )}

      {/* Details */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Details</h2>
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2">
              <label className="label">Full Name</label>
              <input
                className="input"
                value={form.full_name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.party_type ?? "individual"}
                onChange={(e) => setForm((f) => ({ ...f, party_type: e.target.value as Party["party_type"] }))}
              >
                <option value="individual">Individual</option>
                <option value="corporation">Corporation</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="is_pm"
                type="checkbox"
                checked={form.is_property_manager ?? false}
                onChange={(e) => setForm((f) => ({ ...f, is_property_manager: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <label htmlFor="is_pm" className="text-sm text-slate-700">Property Manager</label>
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="label">Mailing Address</label>
              <input
                className="input mb-2"
                placeholder="Line 1"
                value={form.mailing_address_line1 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, mailing_address_line1: e.target.value }))}
              />
              <input
                className="input mb-2"
                placeholder="Line 2 (optional)"
                value={form.mailing_address_line2 ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, mailing_address_line2: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="input"
                  placeholder="City"
                  value={form.mailing_city ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, mailing_city: e.target.value }))}
                />
                <input
                  className="input"
                  placeholder="Province"
                  value={form.mailing_province ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, mailing_province: e.target.value }))}
                />
                <input
                  className="input"
                  placeholder="Postal Code"
                  value={form.mailing_postal_code ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, mailing_postal_code: e.target.value }))}
                />
              </div>
            </div>
            <div className="col-span-1 sm:col-span-2">
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
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Mailing Address" value={[
              party.mailing_address_line1,
              party.mailing_address_line2,
              [party.mailing_city, party.mailing_province, party.mailing_postal_code]
                .filter(Boolean).join(", "),
            ].filter(Boolean).join("\n") || null} />
            <Field label="Notes" value={party.notes} />
          </dl>
        )}
      </div>

      {/* Contact Methods */}
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Contact Methods</h2>
        </div>
        {party.contact_methods.length === 0 ? (
          <div className="px-6 py-4 text-slate-400 text-sm">No contact methods on file.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {party.contact_methods.map((cm) => (
              <li key={cm.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                <span className="w-16 text-xs font-medium text-slate-500">{CM_LABELS[cm.method_type]}</span>
                <span className="flex-1 font-mono">{cm.value}</span>
                {cm.is_primary && <span className="badge-blue">Primary</span>}
                <button
                  onClick={() => {
                    if (confirm("Remove this contact method?")) delCmMut.mutate(cm.id);
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Lot Assignments */}
      {party.current_assignments.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Lot Assignments</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {party.current_assignments.map((a) => (
              <li key={a.id} className="px-6 py-4 flex items-start gap-4">
                <span className={roleBadgeClass(a.role)}>{ROLE_LABELS[a.role]}</span>
                <div className="flex-1">
                  <Link
                    to={`/lots/${a.lot.id}`}
                    className="font-medium text-blue-600 hover:underline text-sm"
                  >
                    SL{a.lot.strata_lot_number}
                    {a.lot.unit_number && ` — Unit ${a.lot.unit_number}`}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {a.start_date && `From ${formatDate(a.start_date)}`}
                    {a.form_k_filed_date && ` · Form K: ${formatDate(a.form_k_filed_date)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
