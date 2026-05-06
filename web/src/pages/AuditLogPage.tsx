import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditLogApi, type AuditLogResponse } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { ChevronLeft, ChevronRight, Filter, ClipboardList } from "lucide-react";

// ---------------------------------------------------------------------------
// Action labels
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  import: "Imported",
  login: "Logged in",
  logout: "Logged out",
  password_reset: "Password Reset",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  import: "bg-purple-100 text-purple-700",
  login: "bg-slate-100 text-slate-700",
  logout: "bg-slate-100 text-slate-700",
  password_reset: "bg-amber-100 text-amber-700",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityFilter, setEntityFilter] = useState<string>("");

  const { data, isLoading, error } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log", page, actionFilter, entityFilter],
    queryFn: () =>
      auditLogApi.list({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        action: actionFilter || undefined,
        entity_type: entityFilter || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const entries = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Activity Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Complete audit trail of all actions performed in the system
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Filters</span>
        </div>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="input text-sm py-1.5 w-auto min-w-[140px]"
        >
          <option value="">All actions</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
          <option value="import">Imported</option>
          <option value="login">Logged in</option>
          <option value="logout">Logged out</option>
          <option value="password_reset">Password Reset</option>
        </select>

        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}
          className="input text-sm py-1.5 w-auto min-w-[160px]"
        >
          <option value="">All entity types</option>
          <option value="user">User</option>
          <option value="lot">Lot</option>
          <option value="party">Party</option>
          <option value="bylaw">Bylaw</option>
          <option value="infraction">Infraction</option>
          <option value="incident">Incident</option>
          <option value="issue">Issue</option>
          <option value="document">Document</option>
        </select>

        {(actionFilter || entityFilter) && (
          <button
            onClick={() => { setActionFilter(""); setEntityFilter(""); setPage(0); }}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 px-4">
                <div className="h-5 bg-slate-200 rounded w-20" />
                <div className="h-5 bg-slate-200 rounded w-16" />
                <div className="h-5 bg-slate-200 rounded w-32" />
                <div className="flex-1 h-5 bg-slate-200 rounded" />
                <div className="h-5 bg-slate-200 rounded w-24" />
                <div className="h-5 bg-slate-200 rounded w-28" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 inline-block">
              <p className="text-sm text-red-700">Failed to load activity log: {error.message}</p>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No activity found.</p>
            <p className="text-xs text-slate-400 mt-1">Activity will appear here as actions are performed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Entity</th>
                  <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actor</th>
                  <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Changes</th>
                  <th className="hidden lg:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IP Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[entry.action] ?? "bg-slate-100 text-slate-700"}`}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <span className="font-medium capitalize">{entry.entity_name ?? entry.entity_type.replace(/_/g, " ")}</span>
                      {entry.entity_id != null && !entry.entity_name && (
                        <span className="text-slate-400 ml-1">#{entry.entity_id}</span>
                      )}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-600">
                      {entry.actor_email ?? <span className="text-slate-400 italic">system</span>}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-slate-500 max-w-xs">
                      {entry.changes ? (
                        <details className="group">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-700 text-xs font-medium">
                            View details
                          </summary>
                          <pre className="mt-1 p-2 bg-slate-50 rounded text-xs text-slate-600 overflow-x-auto max-h-32 overflow-y-auto">
                            {JSON.stringify(entry.changes, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-slate-500 font-mono text-xs">
                      {entry.ip_address ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {formatDateTime(entry.occurred_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} entries
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-sm text-slate-500 px-2">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
