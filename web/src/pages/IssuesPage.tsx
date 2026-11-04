import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useListParams } from "../hooks/useListParams";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import ActiveFilters from "../components/ui/ActiveFilters";
import { SortButton } from "../components/ui/SortHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Wrench, ChevronDown, ChevronUp, Pencil, AlertCircle, Trash2, MessageSquare, Send } from "lucide-react";
import { fmtDatetime } from "../lib/dates";
import {
  issuesApi, lotsApi, incidentsApi,
  type Issue, type IssueStatus, type IssuePriority, type EntityNote,
} from "../lib/api";
import { useToast } from "../lib/toast";

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
  // Strip time so due_date "2026-05-05T14:00" is still "overdue" on May 6
  const due = new Date(issue.due_date);
  const now = new Date();
  return new Date(due.getFullYear(), due.getMonth(), due.getDate()) <
         new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  const { addToast } = useToast();
  const initialDueRaw = initial?.due_date ?? "";
  const hasDueTime = initialDueRaw.includes("T");
  const extractedDueDate = hasDueTime ? initialDueRaw.slice(0, 10) : initialDueRaw;
  const extractedDueTime = hasDueTime ? initialDueRaw.slice(11, 16) : "";
  const initialDueTimeVal = extractedDueTime && extractedDueTime !== "00:00" ? extractedDueTime : "";

  const [form, setForm] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    due_date: extractedDueDate,
    due_time: initialDueTimeVal,
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

  // Auto-select lot when search yields exactly one match
  useEffect(() => {
    if (lotsData?.items.length === 1 && !form.related_lot_id) {
      const lot = lotsData.items[0];
      setForm((f) => ({ ...f, related_lot_id: String(lot.id) }));
    }
  }, [lotsData, form.related_lot_id]);

  const { data: incidents } = useQuery({
    queryKey: ["incidents", { open_only: true }],
    queryFn: () => incidentsApi.list({ limit: 100 }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const due_datetime = form.due_date
        ? form.due_time
          ? `${form.due_date}T${form.due_time}:00`
          : form.due_date
        : null;
      const payload = {
        title: form.title,
        description: form.description || null,
        due_date: due_datetime,
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
      addToast("success", initial ? "Issue updated." : "Issue created.");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-white rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-xl sm:mx-4 max-h-[85vh] flex flex-col sm:max-h-[85vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{initial ? "Edit Issue" : "Create Issue"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div>
              <label className="label">Time <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                type="time"
                className="input"
                value={form.due_time}
                onChange={(e) => setForm({ ...form, due_time: e.target.value })}
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
              {incidents?.items?.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  INC-{inc.id} — {inc.category} ({fmtDatetime(inc.incident_date)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
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

function IssueRow({ issue, onEdit, initialExpanded }: { issue: Issue; onEdit: () => void; initialExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (initialExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialExpanded]);
  const qc = useQueryClient();

  const quickStatus = useMutation({
    mutationFn: (status: IssueStatus) => issuesApi.update(issue.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => issuesApi.delete(issue.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues"] }),
  });

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete "${issue.title}"? This cannot be undone.`)) {
      deleteMutation.mutate();
    }
  }

  const overdue = isOverdue(issue);

  return (
    <>
      <tr
        ref={rowRef}
        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${overdue ? "bg-red-50/30" : ""}`}
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800">{issue.title}</p>
            {overdue && (
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" aria-label="Overdue" />
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
            <span className={overdue ? "text-red-600 font-medium" : ""}>{fmtDatetime(issue.due_date)}</span>
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
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="text-slate-400 hover:text-red-600 disabled:opacity-40"
            title="Delete issue"
          >
            <Trash2 className="w-3.5 h-3.5" />
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
                  Linked incident: INC-{issue.related_incident.id} — {issue.related_incident.category} ({fmtDatetime(issue.related_incident.incident_date)})
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Move to:</span>
                {(["open", "in_progress", "resolved", "closed"] as IssueStatus[])
                  .filter((s) => s !== issue.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={(e) => { e.stopPropagation(); quickStatus.mutate(s); }}
                      disabled={quickStatus.isPending}
                      className="text-xs btn btn-secondary py-0.5 px-2"
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
              </div>
              <IssueNotesPanel issueId={issue.id} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Issue notes panel
// ---------------------------------------------------------------------------

function IssueNotesPanel({ issueId }: { issueId: number }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [text, setText] = useState("");

  const { data: notes } = useQuery<EntityNote[]>({
    queryKey: ["issue-notes", issueId],
    queryFn: () => issuesApi.listNotes(issueId),
  });

  const addMut = useMutation({
    mutationFn: () => issuesApi.addNote(issueId, text.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["issue-notes", issueId] });
      setText("");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const delMut = useMutation({
    mutationFn: (noteId: number) => issuesApi.deleteNote(issueId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-notes", issueId] }),
    onError: (e: Error) => addToast("error", e.message),
  });

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" />
        Updates {notes && notes.length > 0 && `(${notes.length})`}
      </h4>
      {notes && notes.length > 0 && (
        <div className="space-y-2 mb-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg px-3 py-2 text-sm bg-white border border-slate-200">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
          className="input text-sm flex-1 min-h-[52px] resize-y"
          placeholder="Add an update…"
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
// Main page
// ---------------------------------------------------------------------------

const PRIORITY_FILTERS: { value: IssuePriority | ""; label: string }[] = [
  { value: "", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_FILTERS: { value: IssueStatus | "" | "active" | "overdue"; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active (open + in progress)" },
  { value: "overdue", label: "Overdue" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function IssuesPage() {
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open") ? Number(searchParams.get("open")) : null;
  const { values, page, setPage, update, clearAll } = useListParams({ q: "", status: "", priority: "", sort: "", size: "25" });
  const search = values.q;
  const statusFilter = values.status;
  const priorityFilter = values.priority as IssuePriority | "";
  const sort = values.sort;
  const pageSize = Number(values.size) || 25;
  const openOnly = statusFilter === "active";
  const overdueOnly = statusFilter === "overdue";
  const [showCreate, setShowCreate] = useState(false);
  const [editIssue, setEditIssue] = useState<Issue | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["issues", { search, statusFilter, priorityFilter, sort, page, pageSize }],
    queryFn: () =>
      issuesApi.list({
        status: statusFilter && !openOnly && !overdueOnly ? (statusFilter as IssueStatus) : undefined,
        priority: priorityFilter || undefined,
        open_only: openOnly,
        overdue_only: overdueOnly,
        search: search || undefined,
        sort: sort || undefined,
        skip: page * pageSize,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  // Deep-linked issue (?open=ID) may not be on the current page; fetch it so it is always visible.
  const { data: linkedIssue } = useQuery({
    queryKey: ["issue", openId],
    queryFn: () => issuesApi.get(openId!),
    enabled: !!openId,
  });
  const pageItems = data?.items;
  const issues = linkedIssue && pageItems && !pageItems.some((i) => i.id === linkedIssue.id)
    ? [linkedIssue, ...pageItems]
    : pageItems;

  // Real totals for the stats strip (the list itself only holds one page).
  const { data: activeStat } = useQuery({
    queryKey: ["issues", "stat", "active"],
    queryFn: () => issuesApi.list({ open_only: true, limit: 1 }),
  });
  const { data: overdueStat } = useQuery({
    queryKey: ["issues", "stat", "overdue"],
    queryFn: () => issuesApi.list({ overdue_only: true, limit: 1 }),
  });
  const activeCount = activeStat?.total ?? 0;
  const overdueCount = overdueStat?.total ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-slate-500" />
            Issues
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Maintenance and council action items
          </p>
        </div>
        <button className="btn btn-primary self-start sm:self-auto" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">Create Issue</span><span className="sm:hidden ml-1">New</span>
        </button>
      </div>

      <div className="flex gap-2 md:gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => update({ status: "active" })}
          className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px] hover:bg-slate-50"
        >
          <p className="text-2xl font-bold text-amber-600">{activeStat ? activeCount : "–"}</p>
          <p className="text-xs text-slate-500 mt-0.5">Active</p>
        </button>
        {overdueCount > 0 && (
          <button
            type="button"
            onClick={() => update({ status: "overdue" })}
            className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px] border-red-200 hover:bg-red-50"
          >
            <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
            <p className="text-xs text-slate-500 mt-0.5">Overdue</p>
          </button>
        )}
        <div className="card px-3 md:px-4 py-3 text-center min-w-[70px] md:min-w-[80px]">
          <p className="text-2xl font-bold text-slate-600">{data?.total ?? "–"}</p>
          <p className="text-xs text-slate-500 mt-0.5">Matching</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <SearchInput
          value={search}
          onChange={(v) => update({ q: v })}
          placeholder="Search title or description…"
          className="flex-1 min-w-[220px] max-w-md"
        />
        <select
          className="input w-52"
          value={statusFilter}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select
          className="input w-40"
          value={priorityFilter}
          onChange={(e) => update({ priority: e.target.value })}
          aria-label="Filter by priority"
        >
          {PRIORITY_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      <ActiveFilters
        chips={[
          ...(search ? [{ label: `Search: “${search}”`, onRemove: () => update({ q: "" }) }] : []),
          ...(statusFilter
            ? [{
                label: `Status: ${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? statusFilter}`,
                onRemove: () => update({ status: "" }),
              }]
            : []),
          ...(priorityFilter
            ? [{
                label: `Priority: ${PRIORITY_FILTERS.find((f) => f.value === priorityFilter)?.label ?? priorityFilter}`,
                onRemove: () => update({ priority: "" }),
              }]
            : []),
        ]}
        onClearAll={clearAll}
      />

      <div className="card p-0 overflow-hidden -mx-4 sm:mx-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <SortButton label="Title" sortKey="title" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-24">
                <SortButton label="Priority" sortKey="priority" sort={sort || "priority:desc"} onSort={(v) => update({ sort: v })} firstDir="desc" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">
                <SortButton label="Status" sortKey="status" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">
                <SortButton label="Due" sortKey="due" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
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
                  {error ? "Failed to load issues." : search || statusFilter || priorityFilter ? (
                    <>No issues match these filters. <button className="underline" onClick={clearAll}>Clear all</button></>
                  ) : "No issues found."}
                </td>
              </tr>
            )}
            {issues?.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onEdit={() => setEditIssue(issue)}
                initialExpanded={issue.id === openId}
              />
            ))}
          </tbody>
        </table>
        </div>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={setPage}
          onPageSize={(n) => update({ size: String(n) })}
        />
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
