import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Trash2, Mail } from "lucide-react";
import { fmtDatetime } from "../../lib/dates";
import { lotLabel } from "../../lib/utils";
import { incidentsApi, type Incident, type IncidentStatus } from "../../lib/api";
import { useToast } from "../../lib/toast";
import SendIncidentEmailModal from "../../components/SendIncidentEmailModal";
import { STATUS_LABELS, STATUS_SELECT_CLS } from "./constants";
import { MediaPanel } from "./MediaPanel";
import { NotesPanel } from "./NotesPanel";
import { QuickAssignLot } from "./QuickAssignLot";


export function IncidentRow({ incident, onEdit, initialExpanded, isSelected, onToggleSelect }: {
  incident: Incident;
  onEdit: () => void;
  initialExpanded?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (initialExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialExpanded]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const { addToast } = useToast();

  const quickStatus = useMutation({
    mutationFn: (status: IncidentStatus) => incidentsApi.update(incident.id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => incidentsApi.delete(incident.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      addToast("success", `${incident.reference} deleted.`);
    },
    onError: (e: Error) => addToast("error", e.message),
  });

  const isPending = incident.status === "pending_assignment";

  const locationLabel = incident.lot
    ? lotLabel(incident.lot)
    : isPending && incident.raw_unit_hint
      ? `Unit hint: ${incident.raw_unit_hint}`
      : incident.common_area_description ?? "Common area";

  return (
    <>
      <tr
        ref={rowRef}
        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${isPending ? "bg-amber-50/40" : ""} ${isSelected ? "bg-blue-50/60" : ""}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input[type=checkbox]")) return;
          setExpanded((x) => !x);
        }}
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
      >
        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={!!isSelected}
            onChange={onToggleSelect}
          />
        </td>
        <td className="hidden md:table-cell px-4 py-3 font-mono text-sm text-slate-500">{incident.reference}</td>
        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{fmtDatetime(incident.incident_date)}</td>
        <td className="px-4 py-3 text-sm font-medium">
          <span className="md:hidden block text-xs font-mono font-normal text-slate-500">{incident.reference}</span>
          <div className="flex items-center gap-1.5">
            {incident.category}
            {incident.source === "email" && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"
                title={incident.reporter_email ?? "Via email"}>
                <Mail className="w-3 h-3" />Email
              </span>
            )}
          </div>
        </td>
        <td className="hidden md:table-cell px-4 py-3 text-sm text-slate-500">
          {incident.lot
            ? <Link to={`/lots/${incident.lot.id}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{locationLabel}</Link>
            : locationLabel}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={incident.status}
            disabled={quickStatus.isPending}
            onChange={(e) => quickStatus.mutate(e.target.value as IncidentStatus)}
            className={`text-xs font-medium rounded-full px-2.5 py-1 border cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors disabled:opacity-60 ${STATUS_SELECT_CLS[incident.status]}`}
          >
            {(Object.entries(STATUS_LABELS) as [IncidentStatus, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3 text-right flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-700 font-medium whitespace-nowrap">Delete?</span>
              <button
                className="text-xs text-red-600 font-semibold hover:underline disabled:opacity-50"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                Yes
              </button>
              <button
                className="text-xs text-slate-500 hover:underline"
                onClick={() => setConfirmDelete(false)}
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onEdit()}
                className="text-slate-500 hover:text-blue-600"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-slate-500 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {!confirmDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
              className="cursor-pointer"
              aria-label={expanded ? "Collapse details" : "Expand details"}
            >
              {expanded
                ? <ChevronUp className="w-4 h-4 text-slate-500" />
                : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-200">
          <td colSpan={7} className="px-6 py-4">
            <div className="max-w-3xl space-y-3">
              {isPending && <QuickAssignLot incident={incident} />}
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{incident.description}</p>
              {incident.reported_by && (
                <p className="text-xs text-slate-500">Reported by: {incident.reported_by}</p>
              )}
              {incident.reporter_email && (
                <p className="text-xs text-slate-500">Reporter email: {incident.reporter_email}</p>
              )}
              {incident.resolution && (
                <div className="border-l-2 border-green-400 pl-3">
                  <p className="text-xs font-semibold text-green-700 mb-0.5">Resolution</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{incident.resolution}</p>
                </div>
              )}
              {/* Quick status update */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Move to:</span>
                {(["open", "in_progress", "resolved", "closed"] as IncidentStatus[])
                  .filter((s) => s !== incident.status)
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

              {/* Email button */}
              <div className="pt-1">
                <button
                  className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1.5"
                  onClick={() => setEmailOpen(true)}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email Report
                </button>
              </div>

              <NotesPanel incidentId={incident.id} />
              <MediaPanel incidentId={incident.id} />
            </div>
          </td>
        </tr>
      )}
      {emailOpen && (
        <SendIncidentEmailModal incident={incident} onClose={() => setEmailOpen(false)} />
      )}
    </>
  );
}
