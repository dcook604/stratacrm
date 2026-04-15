import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, SkipForward,
  AlertTriangle, Merge, Plus, Eye,
} from "lucide-react";
import {
  importApi, partiesApi,
  type StagedLot, type StagedParty, type StagedPartyAction,
} from "../lib/api";
import { ROLE_LABELS, roleBadgeClass, formatDate, cn } from "../lib/utils";

const CM_LABELS: Record<string, string> = {
  email: "Email", home_phone: "Home", cell_phone: "Cell", work_phone: "Work",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "badge-red", medium: "badge-amber", low: "badge-slate", none: "badge-slate",
};

// ---------------------------------------------------------------------------
// Merge party search modal
// ---------------------------------------------------------------------------
function MergeSearchModal({
  party,
  onSelect,
  onClose,
}: {
  party: StagedParty;
  onSelect: (partyId: number, partyName: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(party.full_name.split(",")[0] ?? "");
  const { data } = useQuery({
    queryKey: ["parties-search", q],
    queryFn: () => partiesApi.list({ search: q, limit: 20 }),
    enabled: q.length >= 2,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-sm">Merge with existing party</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
        </div>
        <div className="p-4">
          <input
            className="input mb-3"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            autoFocus
          />
          {data?.items.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No matches</p>}
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {data?.items.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
                  onClick={() => { onSelect(p.id, p.full_name); onClose(); }}
                >
                  <p className="text-sm font-medium">{p.full_name}</p>
                  <p className="text-xs text-slate-500">
                    {p.primary_email ?? p.primary_phone ?? "no contact"}
                    {p.lot_count > 0 && ` · ${p.lot_count} lot${p.lot_count > 1 ? "s" : ""}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Party action card
// ---------------------------------------------------------------------------
function PartyCard({
  party,
  batchId,
  lotId,
  onChanged,
}: {
  party: StagedParty;
  batchId: number;
  lotId: number;
  onChanged: () => void;
}) {
  const [showMerge, setShowMerge] = useState(false);
  const qc = useQueryClient();

  const setAction = useMutation({
    mutationFn: (body: { action: StagedPartyAction; merge_target_party_id?: number }) =>
      importApi.setPartyAction(batchId, lotId, party.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-lot", batchId, lotId] });
      onChanged();
    },
  });

  const currentAction = party.action;
  const hasDup = party.detected_duplicate_party_id !== null;
  const confidence = party.duplicate_confidence;

  return (
    <>
      <div className={cn(
        "rounded-lg border p-4",
        currentAction === "create" && "border-green-200 bg-green-50",
        currentAction === "merge" && "border-blue-200 bg-blue-50",
        currentAction === "skip" && "border-slate-200 bg-slate-50 opacity-60",
        !currentAction && hasDup && confidence !== "none" && "border-amber-200 bg-amber-50",
        !currentAction && !hasDup && "border-slate-200 bg-white",
      )}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{party.full_name}</span>
              <span className={roleBadgeClass(party.role)}>
                {ROLE_LABELS[party.role] ?? party.role}
              </span>
              {party.is_property_manager && <span className="badge-amber">PM</span>}
              {party.parent_name && (
                <span className="text-xs text-slate-500">c/o {party.parent_name}</span>
              )}
            </div>
            {/* Contact methods */}
            <div className="mt-1 space-y-0.5">
              {party.contact_methods.map((cm, i) => (
                <p key={i} className="text-xs text-slate-500">
                  {CM_LABELS[cm.method_type] ?? cm.method_type}: {cm.value}
                </p>
              ))}
            </div>
            {/* Address */}
            {party.mailing_city && (
              <p className="text-xs text-slate-400 mt-0.5">
                {[party.mailing_address_line1, party.mailing_city, party.mailing_province, party.mailing_postal_code]
                  .filter(Boolean).join(", ")}
              </p>
            )}
            {party.form_k_filed_date && (
              <p className="text-xs text-slate-500 mt-0.5">Form K: {formatDate(party.form_k_filed_date)}</p>
            )}
          </div>

          {/* Action buttons */}
          {currentAction === null ? (
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => setAction.mutate({ action: "create" })}
                className="btn-secondary py-1 px-2 text-xs gap-1"
                title="Create new party"
              >
                <Plus className="w-3 h-3" /> Create
              </button>
              <button
                onClick={() => setShowMerge(true)}
                className="btn-secondary py-1 px-2 text-xs gap-1"
                title="Merge with existing party"
              >
                <Merge className="w-3 h-3" /> Merge
              </button>
              <button
                onClick={() => setAction.mutate({ action: "skip" })}
                className="btn-secondary py-1 px-2 text-xs gap-1 text-slate-500"
                title="Skip — don't import this party"
              >
                <SkipForward className="w-3 h-3" /> Skip
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAction.mutate({ action: "create" })}
              className="text-xs text-slate-400 hover:text-blue-600 shrink-0"
              title="Change action"
            >
              Change
            </button>
          )}
        </div>

        {/* Duplicate warning */}
        {hasDup && confidence !== "none" && (
          <div className={`rounded-md px-3 py-2 mt-2 flex items-center justify-between gap-2
            ${confidence === "high" ? "bg-red-100 border border-red-200" : "bg-amber-100 border border-amber-200"}`}>
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                <span className={`badge ${CONFIDENCE_BADGE[confidence]} mr-1`}>{confidence}</span>
                possible duplicate:{" "}
                <Link
                  to={`/parties/${party.detected_duplicate_party_id}`}
                  target="_blank"
                  className="font-medium text-blue-700 hover:underline"
                >
                  {party.duplicate_party_name}
                </Link>
              </span>
            </div>
            {!currentAction && (
              <button
                onClick={() => setAction.mutate({
                  action: "merge",
                  merge_target_party_id: party.detected_duplicate_party_id!,
                })}
                className="text-xs font-medium text-blue-700 hover:underline shrink-0"
              >
                Use this match
              </button>
            )}
          </div>
        )}

        {/* Current action indicator */}
        {currentAction && (
          <div className="mt-2 text-xs font-medium flex items-center gap-1.5">
            {currentAction === "create" && <><Plus className="w-3 h-3 text-green-600" /><span className="text-green-700">Will create new party</span></>}
            {currentAction === "merge" && (
              <>
                <Merge className="w-3 h-3 text-blue-600" />
                <span className="text-blue-700">
                  Will merge with{" "}
                  <Link to={`/parties/${party.merge_target_party_id}`} target="_blank" className="underline">
                    existing party #{party.merge_target_party_id}
                  </Link>
                </span>
              </>
            )}
            {currentAction === "skip" && <><SkipForward className="w-3 h-3 text-slate-400" /><span className="text-slate-500">Will be skipped</span></>}
          </div>
        )}
      </div>

      {showMerge && (
        <MergeSearchModal
          party={party}
          onSelect={(partyId, _partyName) => {
            setAction.mutate({ action: "merge", merge_target_party_id: partyId });
          }}
          onClose={() => setShowMerge(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lot row
// ---------------------------------------------------------------------------
function LotRow({
  lot,
  batchId,
  onRefresh,
}: {
  lot: StagedLot;
  batchId: number;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(lot.has_duplicates || !!lot.parse_warnings.length);
  const qc = useQueryClient();

  const confirmMut = useMutation({
    mutationFn: () => importApi.confirmLot(batchId, lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-batch", batchId] });
      qc.invalidateQueries({ queryKey: ["import-lots", batchId] });
      onRefresh();
    },
  });

  const skipMut = useMutation({
    mutationFn: () => importApi.skipLot(batchId, lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import-batch", batchId] });
      qc.invalidateQueries({ queryKey: ["import-lots", batchId] });
      onRefresh();
    },
  });

  const [confirmError, setConfirmError] = useState<string | null>(null);

  const statusColor = {
    pending: "bg-amber-100 text-amber-800",
    confirmed: "bg-green-100 text-green-800",
    skipped: "bg-slate-100 text-slate-600",
  }[lot.status];

  return (
    <div className={cn("card mb-2", lot.status === "confirmed" && "opacity-70")}>
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 rounded-lg"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="font-mono font-semibold text-sm">SL{lot.strata_lot_number}</span>
        {lot.unit_number && <span className="text-slate-500 text-sm">Unit {lot.unit_number}</span>}
        {!lot.lot_id && (
          <span className="badge-red text-xs">SL# not in DB</span>
        )}
        <span className="flex items-center gap-1 text-xs text-slate-500 ml-1">
          {lot.parties.length} {lot.parties.length === 1 ? "party" : "parties"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {lot.has_duplicates && (
            <span className="badge-amber flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Duplicates
            </span>
          )}
          {lot.parse_warnings.length > 0 && (
            <span className="badge-amber flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {lot.parse_warnings.length} warning{lot.parse_warnings.length > 1 ? "s" : ""}
            </span>
          )}
          <span className={`badge ${statusColor} capitalize`}>{lot.status}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          {/* Parse warnings */}
          {lot.parse_warnings.map((w, i) => (
            <div key={i} className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 mb-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}

          {/* Party cards */}
          {lot.status === "pending" && (
            <div className="space-y-3 mb-4">
              {lot.parties.map((p) => (
                <PartyCard
                  key={p.id}
                  party={p}
                  batchId={batchId}
                  lotId={lot.id}
                  onChanged={onRefresh}
                />
              ))}
              {lot.parties.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">No parties parsed for this lot</p>
              )}
            </div>
          )}

          {confirmError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 mb-3 text-sm text-red-700">
              {confirmError}
            </div>
          )}

          {lot.status === "pending" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmError(null);
                  confirmMut.mutate(undefined, {
                    onError: (e: Error) => setConfirmError(e.message),
                  });
                }}
                disabled={confirmMut.isPending || skipMut.isPending || !lot.lot_id}
                className="btn-primary py-1.5 text-sm"
                title={!lot.lot_id ? "Cannot confirm — SL# not found in database" : undefined}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {confirmMut.isPending ? "Confirming…" : "Confirm Lot"}
              </button>
              <button
                onClick={() => skipMut.mutate()}
                disabled={confirmMut.isPending || skipMut.isPending}
                className="btn-secondary py-1.5 text-sm"
              >
                <SkipForward className="w-3.5 h-3.5" />
                {skipMut.isPending ? "Skipping…" : "Skip Lot"}
              </button>
            </div>
          )}

          {lot.status === "confirmed" && lot.lot_id && (
            <Link
              to={`/lots/${lot.lot_id}`}
              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" /> View lot in registry
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main review page
// ---------------------------------------------------------------------------
export default function ImportReviewPage() {
  const { batchId: batchIdStr } = useParams<{ batchId: string }>();
  const batchId = Number(batchIdStr);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const { data: batch } = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () => importApi.getBatch(batchId),
    refetchInterval: 5000,
  });

  const { data: lotsData, refetch: refetchLots } = useQuery({
    queryKey: ["import-lots", batchId, issuesOnly, page],
    queryFn: () =>
      importApi.listLots(batchId, {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        issues_only: issuesOnly,
      }),
    placeholderData: (prev) => prev,
  });

  const pct = batch && batch.total_lots > 0
    ? Math.round(((batch.lots_confirmed + batch.lots_skipped) / batch.total_lots) * 100)
    : 0;

  const totalPages = Math.ceil((lotsData?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        to="/import"
        className="text-blue-600 hover:underline text-sm flex items-center gap-1 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Imports
      </Link>

      {/* Batch header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {batch?.original_filename ?? "Import Review"}
            </h1>
            <p className="text-slate-500 text-sm mt-1 capitalize">
              Status: {batch?.status ?? "…"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{pct}%</p>
            <p className="text-xs text-slate-500">
              {batch ? `${batch.lots_confirmed + batch.lots_skipped} of ${batch.total_lots} processed` : ""}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Stats row */}
        {lotsData && (
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-slate-500">{lotsData.lots_pending} pending</span>
            <span className="text-green-600">{lotsData.lots_confirmed} confirmed</span>
            <span className="text-slate-400">{lotsData.lots_skipped} skipped</span>
            {lotsData.lots_with_issues > 0 && (
              <span className="text-amber-600">{lotsData.lots_with_issues} need attention</span>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={(e) => { setIssuesOnly(e.target.checked); setPage(0); }}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          Show only lots needing attention
        </label>
      </div>

      {/* Lots */}
      {!lotsData ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card h-12 animate-pulse" />
          ))}
        </div>
      ) : lotsData.items.length === 0 ? (
        <div className="card px-6 py-12 text-center text-slate-400 text-sm">
          {issuesOnly ? "No lots need attention." : "No lots found."}
        </div>
      ) : (
        <>
          {lotsData.items.map((lot) => (
            <LotRow
              key={lot.id}
              lot={lot}
              batchId={batchId}
              onRefresh={() => refetchLots()}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary py-1.5"
              >
                Previous
              </button>
              <span className="text-slate-500">{page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary py-1.5"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
