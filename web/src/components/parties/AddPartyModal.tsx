import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import { partiesApi, type ContactMethodType, type PartyType } from "../../lib/api";

interface Props {
  onClose: () => void;
}

interface CmForm {
  method_type: ContactMethodType;
  value: string;
  is_primary: boolean;
}

export default function AddPartyModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    party_type: "individual" as PartyType,
    is_property_manager: false,
    mailing_address_line1: "",
    mailing_city: "",
    mailing_province: "BC",
    mailing_postal_code: "",
    notes: "",
  });
  const [contactMethods, setContactMethods] = useState<CmForm[]>([
    { method_type: "email", value: "", is_primary: true },
  ]);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      partiesApi.create({
        ...form,
        contact_methods: contactMethods.filter((cm) => cm.value.trim()),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function addCm() {
    setContactMethods((prev) => [...prev, { method_type: "cell_phone", value: "", is_primary: false }]);
  }

  function removeCm(i: number) {
    setContactMethods((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateCm(i: number, patch: Partial<CmForm>) {
    setContactMethods((prev) => prev.map((cm, idx) => (idx === i ? { ...cm, ...patch } : cm)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add Party</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input
              className="input"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Jane Smith"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.party_type}
                onChange={(e) => setForm((f) => ({ ...f, party_type: e.target.value as PartyType }))}
              >
                <option value="individual">Individual</option>
                <option value="corporation">Corporation</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="pm"
                type="checkbox"
                checked={form.is_property_manager}
                onChange={(e) => setForm((f) => ({ ...f, is_property_manager: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <label htmlFor="pm" className="text-sm text-slate-700">Property Manager</label>
            </div>
          </div>

          <div>
            <label className="label">Mailing Address</label>
            <input
              className="input mb-2"
              placeholder="Street address"
              value={form.mailing_address_line1}
              onChange={(e) => setForm((f) => ({ ...f, mailing_address_line1: e.target.value }))}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                className="input col-span-1"
                placeholder="City"
                value={form.mailing_city}
                onChange={(e) => setForm((f) => ({ ...f, mailing_city: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Province"
                value={form.mailing_province}
                onChange={(e) => setForm((f) => ({ ...f, mailing_province: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Postal Code"
                value={form.mailing_postal_code}
                onChange={(e) => setForm((f) => ({ ...f, mailing_postal_code: e.target.value }))}
              />
            </div>
          </div>

          {/* Contact methods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Contact Methods</label>
              <button type="button" onClick={addCm} className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {contactMethods.map((cm, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="input w-28 shrink-0"
                    value={cm.method_type}
                    onChange={(e) => updateCm(i, { method_type: e.target.value as ContactMethodType })}
                  >
                    <option value="email">Email</option>
                    <option value="cell_phone">Cell</option>
                    <option value="home_phone">Home</option>
                    <option value="work_phone">Work</option>
                  </select>
                  <input
                    className="input flex-1"
                    value={cm.value}
                    onChange={(e) => updateCm(i, { value: e.target.value })}
                    placeholder={cm.method_type === "email" ? "email@example.com" : "604-555-0100"}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                    <input
                      type="checkbox"
                      checked={cm.is_primary}
                      onChange={(e) => updateCm(i, { is_primary: e.target.checked })}
                      className="h-3 w-3"
                    />
                    Primary
                  </label>
                  {contactMethods.length > 1 && (
                    <button onClick={() => removeCm(i)} className="text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => {
              if (!form.full_name.trim()) { setError("Name is required."); return; }
              mut.mutate();
            }}
            disabled={mut.isPending}
            className="btn-primary"
          >
            {mut.isPending ? "Saving…" : "Add Party"}
          </button>
        </div>
      </div>
    </div>
  );
}
