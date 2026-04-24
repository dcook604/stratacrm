import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";
import { partiesApi, lotsApi, type ContactMethodType, type PartyType, type LotAssignmentRole, type LotListItem } from "../../lib/api";

interface Props {
  onClose: () => void;
}

interface CmForm {
  method_type: ContactMethodType;
  value: string;
  is_primary: boolean;
}

const ROLES: { value: LotAssignmentRole; label: string }[] = [
  { value: "owner_occupant",             label: "Owner Occupant" },
  { value: "owner_absentee",             label: "Owner Absentee" },
  { value: "tenant",                     label: "Tenant" },
  { value: "emergency_contact",          label: "Emergency Contact" },
  { value: "key_holder",                 label: "Key Holder" },
  { value: "agent",                      label: "Agent" },
  { value: "property_manager_of_record", label: "Property Manager" },
];

function lotLabel(lot: LotListItem) {
  return `SL${lot.strata_lot_number}${lot.unit_number ? ` — Unit ${lot.unit_number}` : ""}`;
}

// ---------------------------------------------------------------------------
// Lot search combobox
// ---------------------------------------------------------------------------

interface LotComboboxProps {
  lots: LotListItem[];
  isLoading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}

function LotCombobox({ lots, isLoading, selectedId, onSelect }: LotComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLot = lots.find((l) => String(l.id) === selectedId);

  const filtered = query.trim()
    ? lots.filter((l) =>
        lotLabel(l).toLowerCase().includes(query.toLowerCase()) ||
        String(l.strata_lot_number).includes(query) ||
        (l.unit_number ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : lots;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleSelect(lot: LotListItem) {
    onSelect(String(lot.id));
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onSelect("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="input flex items-center gap-2 cursor-pointer pr-2"
        onClick={() => { setOpen((o) => !o); }}
      >
        {selectedLot ? (
          <>
            <span className="flex-1 text-slate-900 text-sm">{lotLabel(selectedLot)}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <input
              className="flex-1 outline-none text-sm bg-transparent placeholder-slate-400"
              placeholder={isLoading ? "Loading lots…" : "Search by SL# or unit…"}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onClick={(e) => { e.stopPropagation(); setOpen(true); }}
            />
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </>
        )}
      </div>

      {open && !selectedLot && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No lots found</div>
          ) : (
            filtered.map((lot) => (
              <button
                key={lot.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(lot); }}
              >
                {lotLabel(lot)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

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
  const [lotId, setLotId] = useState<string>("");
  const [role, setRole] = useState<LotAssignmentRole>("owner_occupant");
  const [error, setError] = useState<string | null>(null);

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots", "all"],
    queryFn: () => lotsApi.list({ limit: 500 }),
  });
  const lots = lotsData?.items ?? [];

  const mut = useMutation({
    mutationFn: async () => {
      const party = await partiesApi.create({
        ...form,
        contact_methods: contactMethods.filter((cm) => cm.value.trim()),
      });
      if (lotId) {
        await lotsApi.createAssignment(Number(lotId), {
          party_id: party.id,
          role,
        });
      }
      return party;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200">
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

          <div className="border-t border-slate-200 pt-4">
            <label className="label">
              Assign to Lot <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <LotCombobox
                lots={lots}
                isLoading={lotsLoading}
                selectedId={lotId}
                onSelect={setLotId}
              />
              <select
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as LotAssignmentRole)}
                disabled={!lotId}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
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
