import { useDialog } from "../../hooks/useDialog";
import { X, GitMerge } from "lucide-react";
import { fmtDatetime } from "../../lib/dates";
import { lotLabel } from "../../lib/utils";
import { type Incident } from "../../lib/api";
import { STATUS_COLOURS, STATUS_LABELS } from "./constants";


// ---------------------------------------------------------------------------
// Merge dialog
// ---------------------------------------------------------------------------

export function MergeDialog({
  incidents,
  selectedIds,
  mergePrimaryId,
  onSetMergePrimaryId,
  onConfirm,
  onCancel,
  isPending,
}: {
  incidents: Incident[];
  selectedIds: Set<number>;
  mergePrimaryId: number | null;
  onSetMergePrimaryId: (id: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const dialogRef2 = useDialog(onCancel);
  const selected = incidents.filter((i) => selectedIds.has(i.id));
  const firstInList = selected.length > 0 ? selected[0].id : null;
  const effectivePrimary = mergePrimaryId ?? firstInList;
  const primary = selected.find((i) => i.id === effectivePrimary);
  const otherCount = effectivePrimary ? selected.length - 1 : 0;

  return (
    <div ref={dialogRef2} className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-center bg-black/50 sm:pt-16">
      <div className="bg-surface rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-slate-500" />
            Merge {selected.length} Incidents
          </h2>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Select the primary incident — it will survive and absorb the others.
          </p>

          <div className="space-y-2">
            {selected.map((inc) => (
              <label
                key={inc.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  effectivePrimary === inc.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="merge-primary"
                  className="mt-0.5"
                  checked={effectivePrimary === inc.id}
                  onChange={() => onSetMergePrimaryId(inc.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-800">{inc.reference}</span>
                    <span className={`badge ${STATUS_COLOURS[inc.status]}`}>{STATUS_LABELS[inc.status]}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5 line-clamp-1">{inc.category}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inc.lot
                      ? lotLabel(inc.lot)
                      : inc.common_area_description || "Common area"}
                    {" · "}
                    {fmtDatetime(inc.incident_date)}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {effectivePrimary && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
              <p className="font-medium">What will happen</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside text-amber-700">
                <li>All notes from the other {otherCount} incident{otherCount !== 1 ? "s" : ""} will move to <strong>{primary?.reference}</strong>.</li>
                <li>Any linked issues will be reassigned to the primary incident.</li>
                <li>Media attachments will be consolidated under the primary.</li>
                <li>The other incident{otherCount !== 1 ? "s" : ""} will be marked as merged and hidden from the list.</li>
                <li>A timeline note will be added recording this merge.</li>
                <li className="font-semibold">This action cannot be undone.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onCancel} className="btn btn-secondary">Cancel</button>
          <button
            className="btn bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={!effectivePrimary || isPending}
            onClick={onConfirm}
          >
            {isPending ? "Merging…" : `Merge ${selected.length} Incidents`}
          </button>
        </div>
      </div>
    </div>
  );
}
