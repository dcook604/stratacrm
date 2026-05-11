import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit2, Check, X, Trash2, AlertTriangle, FileText, Wrench, ChevronUp } from "lucide-react";
import {
  lotsApi, infractionsApi, incidentsApi, issuesApi,
  type Lot, type InfractionListItem, type Incident, type Issue,
  type InfractionStatus, type IncidentStatus, type IssueStatus, type IssuePriority,
} from "../lib/api";
import { ROLE_LABELS, roleBadgeClass, formatDate } from "../lib/utils";
import { fmtDatetime } from "../lib/dates";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const INFRACTION_STATUS_LABELS: Record<InfractionStatus, string> = {
  open: "Open", notice_sent: "Notice Sent", response_received: "Response Received",
  hearing_scheduled: "Hearing Scheduled", fined: "Fined", dismissed: "Dismissed", appealed: "Appealed",
};
const INFRACTION_STATUS_COLOURS: Record<InfractionStatus, string> = {
  open: "badge-amber", notice_sent: "badge-blue", response_received: "badge-blue",
  hearing_scheduled: "badge-amber", fined: "badge-red", dismissed: "badge-slate", appealed: "badge-amber",
};

const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved",
  closed: "Closed", pending_assignment: "Pending Assignment",
};
const INCIDENT_STATUS_COLOURS: Record<IncidentStatus, string> = {
  open: "badge-amber", in_progress: "badge-blue", resolved: "badge-green",
  closed: "badge-slate", pending_assignment: "badge-red",
};

const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};
const ISSUE_STATUS_COLOURS: Record<IssueStatus, string> = {
  open: "badge-amber", in_progress: "badge-blue", resolved: "badge-green", closed: "badge-slate",
};
const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};
const ISSUE_PRIORITY_COLOURS: Record<IssuePriority, string> = {
  low: "badge-slate", medium: "badge-blue", high: "badge-amber", urgent: "badge-red",
};

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

  const [expandedSection, setExpandedSection] = useState<"infractions" | "incidents" | "issues" | null>(null);

  const { data: infractions } = useQuery<InfractionListItem[]>({
    queryKey: ["infractions", { lot_id: lotId }],
    queryFn: () => infractionsApi.list({ lot_id: lotId, limit: 200 }),
    enabled: !!lotId,
  });

  const { data: incidents } = useQuery<Incident[]>({
    queryKey: ["incidents", { lot_id: lotId }],
    queryFn: () => incidentsApi.list({ lot_id: lotId, limit: 200 }),
    enabled: !!lotId,
  });

  const { data: issues } = useQuery<Issue[]>({
    queryKey: ["issues", { lot_id: lotId }],
    queryFn: () => issuesApi.list({ lot_id: lotId, limit: 200 }),
    enabled: !!lotId,
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
      <div className="p-4 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-48 bg-slate-100 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="p-4 sm:p-8">
        <Link to="/lots" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Lots
        </Link>
        <p className="text-red-600">Lot not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <Link to="/lots" className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Lots
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Field label="Unit Number" value={lot.unit_number} />
            <Field
              label="Square Feet"
              value={lot.square_feet ? Number(lot.square_feet).toLocaleString() + " sq ft" : null}
            />
            <Field label="Parking Stalls" value={lot.parking_stalls} />
            <Field label="Storage Lockers" value={lot.storage_lockers} />
            <Field label="Bike Lockers" value={lot.bike_lockers} />
            <Field label="Scooter Lockers" value={lot.scooter_lockers} />
            <div className="col-span-1 sm:col-span-2">
              <Field label="Notes" value={lot.notes} />
            </div>
          </dl>
        )}
      </div>

      {/* Activity summary */}
      {(infractions || incidents || issues) && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          <button
            className={`card p-3 sm:p-4 text-left hover:border-amber-300 transition-colors ${expandedSection === "infractions" ? "border-amber-400 bg-amber-50/30" : ""}`}
            onClick={() => setExpandedSection(expandedSection === "infractions" ? null : "infractions")}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">Infractions</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{infractions?.length ?? "—"}</p>
            {infractions && infractions.filter(i => i.status !== "dismissed" && i.status !== "fined").length > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">
                {infractions.filter(i => i.status !== "dismissed" && i.status !== "fined").length} active
              </p>
            )}
          </button>
          <button
            className={`card p-3 sm:p-4 text-left hover:border-blue-300 transition-colors ${expandedSection === "incidents" ? "border-blue-400 bg-blue-50/30" : ""}`}
            onClick={() => setExpandedSection(expandedSection === "incidents" ? null : "incidents")}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">Incidents</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{incidents?.length ?? "—"}</p>
            {incidents && incidents.filter(i => i.status === "open" || i.status === "in_progress").length > 0 && (
              <p className="text-xs text-blue-600 mt-0.5">
                {incidents.filter(i => i.status === "open" || i.status === "in_progress").length} active
              </p>
            )}
          </button>
          <button
            className={`card p-3 sm:p-4 text-left hover:border-purple-300 transition-colors ${expandedSection === "issues" ? "border-purple-400 bg-purple-50/30" : ""}`}
            onClick={() => setExpandedSection(expandedSection === "issues" ? null : "issues")}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
              <Wrench className="w-4 h-4 text-purple-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">Issues</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{issues?.length ?? "—"}</p>
            {issues && issues.filter(i => i.status === "open" || i.status === "in_progress").length > 0 && (
              <p className="text-xs text-purple-600 mt-0.5">
                {issues.filter(i => i.status === "open" || i.status === "in_progress").length} active
              </p>
            )}
          </button>
        </div>
      )}

      {/* Infractions detail */}
      {expandedSection === "infractions" && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Infractions
            </h2>
            <button onClick={() => setExpandedSection(null)} className="text-slate-400 hover:text-slate-600">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          {!infractions || infractions.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400 text-center">No infractions recorded for this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ref</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bylaw</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Occurrence</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {infractions.map(inf => (
                    <tr key={inf.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-500">{inf.id}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="font-medium">{inf.bylaw.bylaw_number}</span>
                        <span className="text-slate-400 ml-1 text-xs">{inf.bylaw.title}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">#{inf.occurrence_number}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${INFRACTION_STATUS_COLOURS[inf.status]}`}>
                          {INFRACTION_STATUS_LABELS[inf.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(inf.complaint_received_date)}</td>
                      <td className="px-4 py-3">
                        <Link to={`/infractions/${inf.id}`} className="text-blue-600 hover:underline text-xs font-medium">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Incidents detail */}
      {expandedSection === "incidents" && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              Incidents
            </h2>
            <button onClick={() => setExpandedSection(null)} className="text-slate-400 hover:text-slate-600">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          {!incidents || incidents.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400 text-center">No incidents recorded for this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Ref</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Category</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="w-24 px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {incidents.map(inc => (
                    <tr key={inc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{inc.reference}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{inc.category}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDatetime(inc.incident_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${INCIDENT_STATUS_COLOURS[inc.status]}`}>
                          {INCIDENT_STATUS_LABELS[inc.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 min-w-0 max-w-[240px] truncate">{inc.description}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          to={`/incidents?open=${inc.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Issues detail */}
      {expandedSection === "issues" && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-500" />
              Issues
            </h2>
            <button onClick={() => setExpandedSection(null)} className="text-slate-400 hover:text-slate-600">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          {!issues || issues.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400 text-center">No issues linked to this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Title</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Priority</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Due</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Assignee</th>
                    <th className="w-24 px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {issues.map(issue => (
                    <tr key={issue.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-medium min-w-0 max-w-[200px] truncate">{issue.title}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${ISSUE_PRIORITY_COLOURS[issue.priority]}`}>
                          {ISSUE_PRIORITY_LABELS[issue.priority]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`badge ${ISSUE_STATUS_COLOURS[issue.status]}`}>
                          {ISSUE_STATUS_LABELS[issue.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {issue.due_date ? formatDate(issue.due_date) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {issue.assignee?.full_name ?? <span className="text-slate-300">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          to={`/issues?open=${issue.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
