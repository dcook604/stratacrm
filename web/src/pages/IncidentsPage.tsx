import { useOpenCreate } from "../hooks/useOpenCreate";
import { TableSkeleton, TableMessage, EmptyState, ErrorState } from "../components/ui/States";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useListParams } from "../hooks/useListParams";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import ActiveFilters from "../components/ui/ActiveFilters";
import { SortButton } from "../components/ui/SortHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, FileText, GitMerge, Download } from "lucide-react";
import { incidentsApi, type Incident, type IncidentStatus } from "../lib/api";
import { useToast } from "../lib/toast";
import ExportEvidenceModal from "../components/ExportEvidenceModal";
import { IncidentFormModal } from "./incidents/IncidentFormModal";
import { IncidentRow } from "./incidents/IncidentRow";
import { MergeDialog } from "./incidents/MergeDialog";



// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: IncidentStatus | "" | "active"; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active (open + in progress)" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function IncidentsPage() {
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open") ? Number(searchParams.get("open")) : null;

  const { values, page, setPage, update, clearAll } = useListParams({ q: "", status: "", sort: "date:desc", size: "25" });
  const search = values.q;
  const sort = values.sort;
  const statusValue = values.status;
  const openOnly = statusValue === "active";
  const statusFilter = (openOnly ? "" : statusValue) as IncidentStatus | "";
  const pageSize = Number(values.size) || 25;

  const [showCreate, setShowCreate] = useState(false);
  useOpenCreate(() => setShowCreate(true));
  const [editIncident, setEditIncident] = useState<Incident | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePrimaryId, setMergePrimaryId] = useState<number | null>(null);
  const [openIdDismissed, setOpenIdDismissed] = useState(false);
  const [showExportEvidence, setShowExportEvidence] = useState(false);

  const qc2 = useQueryClient();
  const { addToast } = useToast();

  // A selection only makes sense for the rows currently on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, statusValue, sort, pageSize]);

  const mergeMut = useMutation({
    mutationFn: ({ primaryId, mergeIds }: { primaryId: number; mergeIds: number[] }) =>
      incidentsApi.merge(primaryId, mergeIds),
    onSuccess: () => {
      qc2.invalidateQueries({ queryKey: ["incidents"] });
      qc2.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelectedIds(new Set());
      setMergeOpen(false);
      addToast("success", "Incidents merged.");
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const { data: paged, isLoading, error: listError, refetch } = useQuery({
    queryKey: ["incidents", { statusFilter, openOnly, search, sort, page, pageSize }],
    queryFn: () =>
      incidentsApi.list({
        status: statusFilter || undefined,
        open_only: openOnly,
        search: search || undefined,
        sort,
        skip: page * pageSize,
        limit: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const incidents = paged?.items ?? [];
  const total = paged?.total ?? 0;

  // Fetch the deep-linked incident separately so it's always visible regardless of page
  const { data: linkedIncident } = useQuery({
    queryKey: ["incident", openId],
    queryFn: () => incidentsApi.get(openId!),
    enabled: !!openId && !openIdDismissed,
  });

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            Incidents
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Property and common area incident log
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {selectedIds.size >= 2 && (
            <button className="btn btn-secondary text-sm" onClick={() => { setMergeOpen(true); setMergePrimaryId(null); }}>
              <GitMerge className="w-4 h-4" />
              Merge {selectedIds.size} Selected
            </button>
          )}
          <button
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setShowExportEvidence(true)}
            title="Export incident evidence PDF for a lot"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Evidence PDF</span>
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /><span className="hidden sm:inline ml-1.5">Log Incident</span><span className="sm:hidden ml-1">New</span>
          </button>
        </div>
      </div>

      {/* Deep-linked incident banner */}
      {linkedIncident && !openIdDismissed && (
        <div className="card border-blue-300 bg-blue-50/40 overflow-hidden">
          <div className="px-4 py-2 border-b border-blue-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Linked Incident</span>
            <button onClick={() => setOpenIdDismissed(true)} className="text-slate-500 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <table className="w-full">
            <tbody>
              <IncidentRow
                incident={linkedIncident}
                onEdit={() => setEditIncident(linkedIncident)}
                initialExpanded={true}
              />
            </tbody>
          </table>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <SearchInput
          value={search}
          onChange={(v) => update({ q: v })}
          placeholder="Search reference, description, category, reporter…"
          className="flex-1 min-w-[220px] max-w-md"
        />
        <select
          className="input w-52"
          value={statusValue}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((st) => (
            <option key={st.value} value={st.value}>{st.label}</option>
          ))}
        </select>
        {total > 0 && (
          <span className="text-xs text-slate-500 ml-auto">{total} incident{total !== 1 ? "s" : ""}</span>
        )}
      </div>
      <ActiveFilters
        chips={[
          ...(search ? [{ label: `Search: “${search}”`, onRemove: () => update({ q: "" }) }] : []),
          ...(statusValue
            ? [{
                label: `Status: ${STATUS_FILTERS.find((f) => f.value === statusValue)?.label ?? statusValue}`,
                onRemove: () => update({ status: "" }),
              }]
            : []),
        ]}
        onClearAll={clearAll}
      />

      <div className="card p-0 overflow-hidden -mx-4 sm:mx-0">
        <div className="table-scroll">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-2 py-3 w-10">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={selectedIds.size > 0 && selectedIds.size === incidents.filter((i) => i.status !== "pending_assignment").length}
                  onChange={() => {
                    if (selectedIds.size > 0) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(incidents.filter((i) => i.status !== "pending_assignment").map((i) => i.id)));
                    }
                  }}
                />
              </th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-20">
                <SortButton label="Ref" sortKey="reference" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-28">
                <SortButton label="Date" sortKey="date" sort={sort} onSort={(v) => update({ sort: v })} firstDir="desc" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <SortButton label="Category" sortKey="category" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 w-32">
                <SortButton label="Status" sortKey="status" sort={sort} onSort={(v) => update({ sort: v })} />
              </th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <TableSkeleton columns={7} />}
            {!isLoading && listError && (
              <TableMessage columns={7}>
                <ErrorState message="Failed to load incidents." onRetry={() => refetch()} />
              </TableMessage>
            )}
            {!isLoading && !listError && incidents.length === 0 && (
              <TableMessage columns={7}>
                {search || statusValue ? (
                  <EmptyState
                    icon={FileText}
                    title="No incidents match these filters"
                    action={<button className="btn-secondary text-xs px-3 py-1.5" onClick={clearAll}>Clear all filters</button>}
                  />
                ) : (
                  <EmptyState
                    icon={FileText}
                    title="No incidents logged yet"
                    action={<button className="btn-primary text-xs px-3 py-1.5" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5" /> Log Incident</button>}
                  />
                )}
              </TableMessage>
            )}
            {incidents.map((inc) => (
              <IncidentRow
                key={inc.id}
                incident={inc}
                onEdit={() => setEditIncident(inc)}
                initialExpanded={!openIdDismissed && inc.id === openId && !linkedIncident}
                isSelected={selectedIds.has(inc.id)}
                onToggleSelect={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(inc.id)) next.delete(inc.id);
                    else next.add(inc.id);
                    return next;
                  });
                }}
              />
            ))}
          </tbody>
        </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(n) => update({ size: String(n) })}
        />
      </div>

      {showCreate && (
        <IncidentFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editIncident && (
        <IncidentFormModal
          initial={editIncident}
          onClose={() => setEditIncident(null)}
          onSaved={() => setEditIncident(null)}
        />
      )}

      {mergeOpen && selectedIds.size >= 2 && (
        <MergeDialog
          incidents={incidents}
          selectedIds={selectedIds}
          mergePrimaryId={mergePrimaryId}
          onSetMergePrimaryId={setMergePrimaryId}
          onConfirm={() => {
            const primaryId = mergePrimaryId ?? Array.from(selectedIds)[0];
            const mergeIds = Array.from(selectedIds).filter((id) => id !== primaryId);
            mergeMut.mutate({ primaryId, mergeIds });
          }}
          onCancel={() => { setMergeOpen(false); setMergePrimaryId(null); }}
          isPending={mergeMut.isPending}
        />
      )}

      {showExportEvidence && (
        <ExportEvidenceModal
          onClose={() => setShowExportEvidence(false)}
        />
      )}
    </div>
  );
}
