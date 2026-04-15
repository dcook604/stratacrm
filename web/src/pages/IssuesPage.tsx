import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Wrench, ChevronDown, ChevronUp, Pencil, AlertCircle } from "lucide-react";
import {
  issuesApi, lotsApi, incidentsApi,
  type Issue, type IssueStatus, type IssuePriority,
} from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLOURS: Record<IssueStatus, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  resolved: "badge-green",
  closed: "badge-slate",
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_COLOURS: Record<IssuePriority, string> = {
  low: "badge-slate",
  medium: "badge-blue",
  high: "badge-amber",
  urgent: "badge-red",
};

function isOverdue(issue: Issue): boolean {
  if (!issue.due_date) return false;
  if (issue.status === "resolved" || issue.status === "closed") return false;
  return new Date(issue.due_date) < new Date();
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface IssueFormProps {
  initial?: Issue | null;
  onClose: () => void;
  onSaved: () => void;
}

function IssueFormModal({ initial, onClose, onSaved }: IssueFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    due_date: initial?.due_date ?? "",
    priority: (initial?.priority ?? "medium") as IssuePriority,
    status: (initial?.status ?? "open") as IssueStatus,
    related_lot_id: initial?.related_lot?.id ? String(initial.related_lot.id) : "",
    related_incident_id: initial?.related_incident?.id ? String(initial.related_incident.id) : "",
  });
  const [lotSearch, setLotSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: lotsData } = useQuery({
    queryKey: ["lots", { search: lotSearch }],
    queryFn: () => lotsApi.list({ limit: 20, search: lotSearch || undefined }),
  });

  const { data: incidents } = useQuery({
    queryKey: ["incidents", { open_only: true }],
    queryFn: () => incidentsApi.list({ limit: 100 }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        due_date: form.due_date || null,
        priority: form.priority,
        related_lot_id: form.related_lot_id ? Number(form.related_lot_id) : null,
        related_incident_id: form.related_incident_id ? Number(form.related_incident_id) : null,
        ...(initial ? { status: form.status } : {}),
      };
      return initial
        ? issuesApi.update(initial.id, payload)
        : issuesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{initial ? "Edit Issue" : "Create Issue"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          <div>
            <label className="label">Title *</label>
            <input
              type="text"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as IssuePriority })}
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due Date <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="date"
                className="input"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>

          {initial && (
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as IssueStatus })}
              >
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}

          {/* Related lot */}
          <div>
            <label className="label">Related Lot <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="search"
              placeholder="Search lot…"
              className="input mb-1"
              value={lotSearch}
              onChange={(e) => setLotSearch(e.target.value)}
            />
            <select
              className="input"
              value={form.related_lot_id}
              onChange={(e) => setForm({ ...form, related_lot_id: e.target.value })}
            >
              <option value="">— none —</option>
              {lotsData?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  SL{l.strata_lot_number}{l.unit_number ? ` — Unit ${l.unit_number}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Related incident */}
          <div>
            <label className="label">Related Incident <span className="text-slate-400 font-normal">(optional)</span></label>
            <select
              className="input"
              value={form.related_incident_id}
              onChange={(e) => setForm({ ...form, related_incident_id: e.target.value })}
            >
              <option value="">— none —</option>
              {incidents?.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  INC-{inc.id} — {inc.category} ({inc.incident_date})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button
            className="btn btn-primary"
            disabled={mutation.isPending || !form.title.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : initial ? "Save Changes" : "Create Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issue row
// ---------------------------------------------------------------------------

function IssueRow({ issue, onEdit }: { issue: Issue; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const quickStatus = useMutation({
    mutationFn: (status: IssueStatus) => issuesApi.update(issue.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });

  const overdue = isOverdue(issue);

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${overdue ? "bg-red-50/30" : ""}`}
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800">{issue.title}</p>
            {overdue && (
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" title="Overdue" />
            )}
          </div>
          {issue.related_lot && (
            <p className="text-xs text-slate-400 mt-0.5">
              SL{issue.related_lot.strata_lot_number}
              {issue.related_lot.unit_number ? ` Unit ${issue.related_lot.unit_number}` : ""}
            </p>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`badge ${PRIORITY_COLOURS[issue.priority]}`}>
            {PRIORITY_LABELS[issue.priority]}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`badge ${STATUS_COLOURS[issue.status]}`}>
            {STATUS_LABELS[issue.status]}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {issue.due_date ? (
            <span className={overdue ? "text-red-600 font-medium" : ""}>{issue.due_date}</span>
          ) : "—"}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {issue.assignee ? issue.assignee.full_name : "—"}
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
              {issue.description && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.description}</p>
              )}
              {issue.related_incident && (
                <p className="text-xs text-slate-500">
                  Linked incident: INC-{issue.related_incident.id} — {issue.related_incident.category} ({issue.related_incident.incident_date})
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Move to:</span>
                {(["open", "in_progress", "resolved", "closed"] as IssueStatus[])
                  .filter((s) => s !== issue.status)
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

const PRIORITY_FILTERS: { value: IssuePriority | ""; label: string }[] = [
  { value: "", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_FILTERS: { value: IssueStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function IssuesPage() {
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "">("");
  const [openOnly, setOpenOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editIssue, setEditIssue] = useState<Issue | null>(null);

  const { data: issues, isLoading } = useQuery({
    queryKey: ["issues", { statusFilter, priorityFilter, openOnly, overdueOnly }],
    queryFn: () =>
      issuesApi.list({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        open_only: openOnly,
        overdue_only: overdueOnly,
        limit: 200,
      }),
  });

  const activeCount = issues?.filter((i) =>
    i.status === "open" || i.status === "in_progress"
  ).length ?? 0;

  const overdueCount = issues?.filter(isOverdue).length ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-slate-500" />
            Issues
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Maintenance and council action items
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" />Create Issue
        </button>
      </div>

      {issues && (
        <div className="flex gap-4">
          <div className="card px-4 py-3 text-center min-w-[80px]">
            <p className="text-2xl font-bold text-amber-600">{activeCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active</p>
          </div>
          {overdueCount > 0 && (
            <div className="card px-4 py-3 text-center min-w-[80px] border-red-200">
              <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Overdue</p>
            </div>
          )}
          <div className="card px-4 py-3 text-center min-w-[80px]">
            <p className="text-2xl font-bold text-slate-600">{issues.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Showing</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select
          className="input w-44"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as IssueStatus | "");
            if (e.target.value) setOpenOnly(false);
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          className="input w-40"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | "")}
        >
          {PRIORITY_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              if (e.target.checked) { setStatusFilter(""); setOverdueOnly(false); }
            }}
          />
          Active only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              if (e.target.checked) { setOpenOnly(false); setStatusFilter(""); }
            }}
          />
          Overdue only
        </label>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">Due</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-36">Assignee</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td>
              </tr>
            )}
            {!isLoading && (!issues || issues.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  No issues found.
                </td>
              </tr>
            )}
            {issues?.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onEdit={() => setEditIssue(issue)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <IssueFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editIssue && (
        <IssueFormModal
          initial={editIssue}
          onClose={() => setEditIssue(null)}
          onSaved={() => setEditIssue(null)}
        />
      )}
    </div>
  );
}
