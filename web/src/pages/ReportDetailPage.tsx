import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  AlertTriangle,
  FileText as IncidentIcon,
  Wrench,
  Users,
  Building2,
  Calendar,
  Hash,
  Ruler,
  ParkingCircle,
  Archive,
} from "lucide-react";
import { reportsApi } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  open: "badge-amber",
  in_progress: "badge-blue",
  notice_sent: "badge-amber",
  response_received: "badge-blue",
  hearing_scheduled: "badge-blue",
  fined: "badge-red",
  dismissed: "badge-green",
  resolved: "badge-green",
  closed: "badge-slate",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "badge-slate";
  return (
    <span className={`badge ${cls} text-xs`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: "badge-slate",
    medium: "badge-blue",
    high: "badge-amber",
    urgent: "badge-red",
  };
  return (
    <span className={`badge ${colors[priority] ?? "badge-slate"} text-xs`}>
      {priority}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="text-slate-500 min-w-[100px]">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function SummaryCard({ title, open, total, icon: Icon, color }: {
  title: string;
  open: number;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-xl font-bold text-slate-900">
          {open}
          <span className="text-sm font-normal text-slate-400"> / {total}</span>
        </p>
      </div>
    </div>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lotId = Number(id);

  const { data, isLoading, error } = useQuery({
    queryKey: ["report", lotId],
    queryFn: () => reportsApi.get(lotId),
    enabled: !isNaN(lotId),
  });

  if (isNaN(lotId)) {
    return (
      <div className="p-8 text-center text-red-500">
        Invalid lot ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-4 bg-slate-200 rounded w-96" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load report for lot #{lotId}.
      </div>
    );
  }

  const lotLabel = data.unit_number
    ? `SL${data.strata_lot_number} (Unit ${data.unit_number})`
    : `SL${data.strata_lot_number}`;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
        <Link to="/reports" className="hover:text-blue-600 transition-colors">Reports</Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">{lotLabel}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Lot Summary Report — {lotLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/reports" className="btn btn-secondary text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <a
            href={reportsApi.pdfUrl(lotId)}
            className="btn btn-primary text-sm"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
        </div>
      </div>

      {/* Lot info */}
      <div className="card p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">Lot Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <InfoRow icon={Hash} label="Strata Lot" value={`SL${data.strata_lot_number}`} />
          <InfoRow icon={Calendar} label="Unit Number" value={data.unit_number ?? "—"} />
          <InfoRow icon={Ruler} label="Square Feet" value={data.square_feet ? `${Number(data.square_feet).toLocaleString()} sq ft` : "—"} />
          <InfoRow icon={ParkingCircle} label="Parking" value={data.parking_stalls ?? "—"} />
          <InfoRow icon={Archive} label="Storage" value={data.storage_lockers ?? "—"} />
        </div>
      </div>

      {/* Current parties */}
      <div className="card p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Current Parties
        </h2>
        {data.parties.length === 0 ? (
          <p className="text-sm text-slate-400">No parties currently assigned to this lot.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.parties.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1 text-sm">
                <span className="text-xs text-slate-500 uppercase">{p.role.replace(/_/g, " ")}</span>
                <span className="font-medium text-slate-800">{p.full_name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Infractions"
          open={data.open_infractions}
          total={data.total_infractions}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <SummaryCard
          title="Incidents"
          open={data.open_incidents}
          total={data.total_incidents}
          icon={IncidentIcon}
          color="bg-amber-500"
        />
        <SummaryCard
          title="Issues"
          open={data.open_issues}
          total={data.total_issues}
          icon={Wrench}
          color="bg-orange-500"
        />
      </div>

      {/* Infractions table */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            Infractions ({data.total_infractions})
          </h2>
        </div>
        {data.infractions.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            No infractions recorded for this lot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Party</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Bylaw</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Complaint</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Fine</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.infractions.map((inf) => (
                  <tr key={inf.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">{inf.party_name ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{inf.bylaw_number}</td>
                    <td className="px-4 py-2.5 text-slate-700">{new Date(inf.complaint_received_date).toLocaleDateString("en-CA")}</td>
                    <td className="px-4 py-2.5 text-slate-700">{inf.assessed_fine_amount != null ? `$${Number(inf.assessed_fine_amount).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={inf.status} /></td>
                    <td className="px-4 py-2.5">
                      <Link to={`/infractions/${inf.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
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

      {/* Incidents table */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <IncidentIcon className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            Incidents ({data.total_incidents})
          </h2>
        </div>
        {data.incidents.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            No incidents recorded for this lot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Category</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Description</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((inc) => (
                  <tr key={inc.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">{inc.category}</td>
                    <td className="px-4 py-2.5 text-slate-700">{new Date(inc.incident_date).toLocaleDateString("en-CA")}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">{inc.description}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={inc.status} /></td>
                    <td className="px-4 py-2.5">
                      <Link to={`/incidents/${inc.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
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

      {/* Issues table */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            Issues ({data.total_issues})
          </h2>
        </div>
        {data.issues.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            No issues recorded for this lot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Title</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Priority</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Due Date</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Assignee</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map((iss) => (
                  <tr key={iss.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{iss.title}</td>
                    <td className="px-4 py-2.5"><PriorityBadge priority={iss.priority} /></td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {iss.due_date ? new Date(iss.due_date).toLocaleDateString("en-CA") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{iss.assignee_name ?? "—"}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={iss.status} /></td>
                    <td className="px-4 py-2.5">
                      <Link to={`/issues/${iss.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
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
    </div>
  );
}
