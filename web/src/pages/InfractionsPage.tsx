import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, AlertTriangle } from "lucide-react";
import {
  infractionsApi,
  bylawsApi,
  lotsApi,
  partiesApi,
  type InfractionStatus,
  type InfractionListItem,
  type BylawCategory,
} from "../lib/api";
import { useToast } from "../lib/toast";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<InfractionStatus, string> = {
  open: "Open",
  notice_sent: "Notice Sent",
  response_received: "Response Received",
  hearing_scheduled: "Hearing Scheduled",
  fined: "Fined",
  dismissed: "Dismissed",
  appealed: "Appealed",
};

const STATUS_COLOURS: Record<InfractionStatus, string> = {
  open: "badge-amber",
  notice_sent: "badge-blue",
  response_received: "badge-blue",
  hearing_scheduled: "badge-amber",
  fined: "badge-red",
  dismissed: "badge-slate",
  appealed: "badge-amber",
};

const CATEGORY_LABELS: Record<BylawCategory, string> = {
  noise: "Noise",
  pets: "Pets",
  parking: "Parking",
  common_property: "Common Property",
  rental: "Rental",
  alterations: "Alterations",
  move_in_out: "Move In/Out",
  smoking: "Smoking",
  nuisance: "Nuisance",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Create infraction modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreated: (id: number) => void;
}

function CreateInfractionModal({ onClose, onCreated }: CreateModalProps) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [form, setForm] = useState({
    lot_id: "",
    primary_party_id: "",
    bylaw_id: "",
    complaint_received_date: new Date().toISOString().slice(0, 10),
    complaint_source: "",
    description: "",
  });
  const [lotSearch, setLotSearch] = useState("");
  const [partySearch, setPartySearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
  });

  const { data: partiesData } = useQuery({
    queryKey: ["parties", { search: partySearch }],
    queryFn: () => partiesApi.list({ limit: 20, search: partySearch || undefined }),
  });

  const { data: bylaws } = useQuery({
    queryKey: ["bylaws", { active_only: true }],
    queryFn: () => bylawsApi.list({ active_only: true }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      infractionsApi.create({
        lot_id: Number(form.lot_id),
        primary_party_id: Number(form.primary_party_id),
        bylaw_id: Number(form.bylaw_id),
        complaint_received_date: form.complaint_received_date,
        complaint_source: form.complaint_source || undefined,
        description: form.description,
      }),
    onSuccess: (inf) => {
      qc.invalidateQueries({ queryKey: ["infractions"] });
      addToast("success", "Infraction recorded.");
      onCreated(inf.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  const isValid =
    form.lot_id && form.primary_party_id && form.bylaw_id &&
    form.complaint_received_date && form.description.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-2xl sm:mx-4 max-h-[85vh] flex flex-col sm:max-h-[85vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Record New Infraction</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          {/* Lot */}
          <div>
            <label className="label">Strata Lot *</label>
            <input
              type="search"
              placeholder="Search by unit or lot number…"
              className="input mb-1"
              value={lotSearch}
              onChange={(e) => setLotSearch(e.target.value)}
            />
            <select
              className="input"
              value={form.lot_id}
              onChange={(e) => setForm({ ...form, lot_id: e.target.value })}
            >
              <option value="">— select lot —</option>
              {lotsData?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  SL{l.strata_lot_number}
                  {l.unit_number ? ` — Unit ${l.unit_number}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Party */}
          <div>
            <label className="label">Respondent (Party) *</label>
            <input
              type="search"
              placeholder="Search parties…"
              className="input mb-1"
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
            />
            <select
              className="input"
              value={form.primary_party_id}
              onChange={(e) => setForm({ ...form, primary_party_id: e.target.value })}
            >
              <option value="">— select party —</option>
              {partiesData?.items.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          {/* Bylaw */}
          <div>
            <label className="label">Bylaw *</label>
            <select
              className="input"
              value={form.bylaw_id}
              onChange={(e) => setForm({ ...form, bylaw_id: e.target.value })}
            >
              <option value="">— select bylaw —</option>
              {bylaws?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bylaw_number} — {b.title}
                  {" "}[{CATEGORY_LABELS[b.category]}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Complaint date */}
            <div>
              <label className="label">Complaint Received Date *</label>
              <input
                type="date"
                className="input"
                value={form.complaint_received_date}
                onChange={(e) => setForm({ ...form, complaint_received_date: e.target.value })}
              />
            </div>
            {/* Source (confidential) */}
            <div>
              <label className="label">Complaint Source <span className="text-slate-400 font-normal">(confidential)</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. neighbour complaint — not disclosed"
                value={form.complaint_source}
                onChange={(e) => setForm({ ...form, complaint_source: e.target.value })}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description *</label>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder="Describe the alleged contravention…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !isValid}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Recording…" : "Record Infraction"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Infraction row
// ---------------------------------------------------------------------------

function InfractionRow({ inf }: { inf: InfractionListItem }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-sm text-slate-600">INF-{inf.id}</td>
      <td className="px-4 py-3 text-sm">
        <span className="font-medium">SL{inf.lot.strata_lot_number}</span>
        {inf.lot.unit_number && (
          <span className="text-slate-400 ml-1">Unit {inf.lot.unit_number}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">{inf.primary_party.full_name}</td>
      <td className="px-4 py-3 text-sm text-slate-600">
        <p className="font-medium">{inf.bylaw.bylaw_number}</p>
        <p className="text-xs text-slate-400 truncate max-w-[200px]">{inf.bylaw.title}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{inf.complaint_received_date}</td>
      <td className="px-4 py-3">
        <span className={`badge ${STATUS_COLOURS[inf.status]}`}>
          {STATUS_LABELS[inf.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {inf.assessed_fine_amount ? `$${Number(inf.assessed_fine_amount).toFixed(2)}` : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={`/infractions/${inf.id}`}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: InfractionStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "notice_sent", label: "Notice Sent" },
  { value: "response_received", label: "Response Received" },
  { value: "hearing_scheduled", label: "Hearing Scheduled" },
  { value: "fined", label: "Fined" },
  { value: "dismissed", label: "Dismissed" },
  { value: "appealed", label: "Appealed" },
];

export default function InfractionsPage() {
  const [statusFilter, setStatusFilter] = useState<InfractionStatus | "">("");
  const [openOnly, setOpenOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // useNavigate for post-create redirect (inline to avoid import at top for now)
  const { data: infractions, isLoading } = useQuery({
    queryKey: ["infractions", { statusFilter, openOnly }],
    queryFn: () =>
      infractionsApi.list({
        status: statusFilter || undefined,
        open_only: openOnly,
        limit: 200,
      }),
  });

  function handleCreated(id: number) {
    setShowCreate(false);
    window.location.href = `/infractions/${id}`;
  }

  const openCount = infractions?.filter((i) =>
    ["open", "notice_sent", "response_received", "hearing_scheduled"].includes(i.status)
  ).length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Infractions
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            s.135 Strata Property Act — bylaw contravention lifecycle
          </p>
        </div>
        <button className="btn btn-primary self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">Record Infraction</span><span className="sm:hidden ml-1">New</span>
        </button>
      </div>

      {/* Stats strip */}
      {infractions && (
        <div className="flex gap-2 md:gap-4">
          <div className="card px-4 py-3 text-center min-w-[80px]">
            <p className="text-2xl font-bold text-amber-600">{openCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active</p>
          </div>
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-red-600">
              {infractions.filter((i) => i.status === "fined").length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Fined</p>
          </div>
          <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
            <p className="text-2xl font-bold text-slate-600">{infractions.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Showing</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          className="input w-52"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as InfractionStatus | "");
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
          Active only (open → hearing)
        </label>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden -mx-4 sm:mx-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">Ref</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Lot</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Party</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Bylaw</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Complaint Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-36">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">Fine</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && (!infractions || infractions.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                  No infractions found.
                </td>
              </tr>
            )}
            {infractions?.map((inf) => (
              <InfractionRow key={inf.id} inf={inf} />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <CreateInfractionModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
