import { useQuery } from "@tanstack/react-query";
import {
  Building2, Users, AlertTriangle, FileText, Wrench,
  Activity, Clock, Plus, CalendarClock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { dashboardApi, type DashboardStats } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { fmtDatetime, timeAgo } from "../lib/dates";
import { ErrorState } from "../components/ui/States";

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  to,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  to?: string;
  color: string;
}) {
  const content = (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-none">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900 leading-none">{value ?? "—"}</p>
    </div>
  );
  return to ? (
    <Link to={to} className="block hover:shadow-md transition-shadow rounded-lg">
      {content}
    </Link>
  ) : (
    <div className="block">{content}</div>
  );
}

// ---------------------------------------------------------------------------
// Needs Attention section
// ---------------------------------------------------------------------------

function AttentionSection({ data }: { data: DashboardStats }) {
  const hasOverdueNotices = data.overdue_notice_infractions.length > 0;
  const hasOverdueIssues = data.overdue_issues.length > 0;

  if (!hasOverdueNotices && !hasOverdueIssues) return null;

  return (
    <div className="card border-amber-200 bg-amber-50/50">
      <div className="px-4 md:px-6 py-4 border-b border-amber-200 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" />
        <h2 className="font-semibold text-amber-900 text-sm">Needs Attention</h2>
      </div>
      <div className="divide-y divide-amber-100">
        {hasOverdueNotices && (
          <div className="px-4 md:px-6 py-3">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              Notices — Response Window Expired (14+ days)
            </p>
            <ul className="space-y-1">
              {data.overdue_notice_infractions.map((inf) => (
                <li key={inf.id} className="text-sm flex items-center justify-between">
                  <span className="text-slate-700">
                    INF-{inf.id} — SL{inf.lot_number}
                    {inf.unit_number ? ` Unit ${inf.unit_number}` : ""} —{" "}
                    {inf.party_name ?? "Unknown party"}
                  </span>
                  <Link
                    to={`/infractions/${inf.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800 ml-3 shrink-0"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasOverdueIssues && (
          <div className="px-4 md:px-6 py-3">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
              Overdue Issues
            </p>
            <ul className="space-y-1">
              {data.overdue_issues.map((issue) => (
                <li key={issue.id} className="text-sm flex items-center justify-between">
                  <span className="text-slate-700">
                    <span className="font-medium">{issue.title}</span>
                    <span className="text-slate-500 ml-2 capitalize">
                      [{issue.priority}] due {fmtDatetime(issue.due_date)}
                      {issue.assignee_email ? ` · ${issue.assignee_email}` : ""}
                    </span>
                  </span>
                  <Link
                    to={`/issues?open=${issue.id}`}
                    className="text-xs text-blue-600 hover:text-blue-800 ml-3 shrink-0"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Due soon section
// ---------------------------------------------------------------------------

function UpcomingSection({ data }: { data: DashboardStats }) {
  const issues = data.upcoming_issues ?? [];
  const payments = data.upcoming_payments ?? [];

  return (
    <div className="card">
      <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-slate-500" aria-hidden />
        <h2 className="font-semibold text-slate-900 text-sm">Due in the next 7 days</h2>
      </div>
      {issues.length === 0 && payments.length === 0 ? (
        <p className="px-4 md:px-6 py-6 text-center text-slate-500 text-sm">Nothing due this week.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {issues.map((i) => (
            <li key={`i${i.id}`} className="px-4 md:px-6 py-3 flex items-center gap-3 text-sm min-w-0">
              <span className="badge-amber shrink-0">Issue</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">
                {i.title}
                <span className="text-slate-500 capitalize"> · {i.priority}</span>
              </span>
              <time className="text-xs text-slate-500 shrink-0" dateTime={i.due_date ?? undefined}>{fmtDatetime(i.due_date)}</time>
              <Link to={`/issues?open=${i.id}`} className="text-xs text-blue-600 hover:text-blue-800 shrink-0">View →</Link>
            </li>
          ))}
          {payments.map((p) => (
            <li key={`p${p.id}`} className="px-4 md:px-6 py-3 flex items-center gap-3 text-sm min-w-0">
              <span className="badge-blue shrink-0">Payment</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">
                SL{p.lot_number}{p.unit_number ? ` Unit ${p.unit_number}` : ""} · {p.party_name ?? "Unknown party"}
                <span className="text-slate-500"> · ${Number(p.amount_due).toFixed(2)}</span>
              </span>
              <time className="text-xs text-slate-500 shrink-0" dateTime={p.due_date}>{fmtDatetime(p.due_date)}</time>
              <Link to="/payments" className="text-xs text-blue-600 hover:text-blue-800 shrink-0">View →</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action labels for audit log
// ---------------------------------------------------------------------------

const ACTION_META: Record<string, { label: string; className: string }> = {
  login:          { label: "Logged in",      className: "bg-blue-100 text-blue-700" },
  logout:         { label: "Logged out",     className: "bg-slate-100 text-slate-600" },
  create:         { label: "Created",        className: "bg-green-100 text-green-700" },
  update:         { label: "Updated",        className: "bg-amber-100 text-amber-700" },
  delete:         { label: "Deleted",        className: "bg-red-100 text-red-700" },
  import:         { label: "Imported",       className: "bg-purple-100 text-purple-700" },
  password_reset: { label: "Password reset", className: "bg-indigo-100 text-indigo-700" },
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 60_000,
  });

  return (
    <div className="page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Spectrum 4 — Strata Plan BCS2611</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Quick actions" role="group">
          <Link to="/incidents?new=1" className="btn-secondary text-sm"><Plus className="w-4 h-4" /> Log incident</Link>
          <Link to="/infractions?new=1" className="btn-secondary text-sm"><Plus className="w-4 h-4" /> Record infraction</Link>
          <Link to="/issues?new=1" className="btn-secondary text-sm"><Plus className="w-4 h-4" /> Create issue</Link>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 animate-pulse flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
              </div>
              <div className="h-8 w-12 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card p-6">
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load dashboard stats."}
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            icon={Building2}
            label="Strata Lots"
            value={data?.lot_count}
            to="/lots"
            color="bg-blue-600"
          />
          <StatCard
            icon={Users}
            label="Registered Parties"
            value={data?.party_count}
            to="/parties"
            color="bg-indigo-600"
          />
          <StatCard
            icon={AlertTriangle}
            label="Open Infractions"
            value={data?.open_infractions}
            to="/infractions?status=active"
            color="bg-amber-500"
          />
          <StatCard
            icon={FileText}
            label="Open Incidents"
            value={data?.open_incidents}
            to="/incidents?status=active"
            color="bg-orange-500"
          />
          <StatCard
            icon={Wrench}
            label="Open Issues"
            value={data?.open_issues}
            to="/issues?status=active"
            color="bg-slate-500"
          />
        </div>
      )}

      {/* Needs attention */}
      {data && <AttentionSection data={data} />}

      {/* Due soon */}
      {data && <UpcomingSection data={data} />}

      {/* Recent activity */}
      <div className="card">
        <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Recent Activity</h2>
          </div>
          <Link
            to="/audit-log"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View all activity →
          </Link>
        </div>
        {!data?.recent_audit?.length ? (
          <div className="px-4 md:px-6 py-8 text-center text-slate-500 text-sm">No activity yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent_audit.map((entry) => {
              const meta = ACTION_META[entry.action];
              const label = meta?.label ?? entry.action.replace(/_/g, " ");
              const badgeCls = meta?.className ?? "bg-slate-100 text-slate-600";
              const entity = entry.entity_type.replace(/_/g, " ");
              return (
                <li key={entry.id} className="px-4 md:px-6 py-3 flex items-center gap-3 text-sm min-w-0">
                  <span className={`inline-flex items-center shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badgeCls}`}>
                    {label}
                  </span>
                  <span className="text-slate-700 flex-1 min-w-0 truncate capitalize">
                    {entry.entity_name ?? entity}{entry.entity_id != null && !entry.entity_name ? ` #${entry.entity_id}` : ""}
                  </span>
                  <span className="text-slate-500 text-xs shrink-0 hidden sm:flex items-center gap-2">
                    {entry.actor_email && (
                      <span className="truncate max-w-[160px]">{entry.actor_email}</span>
                    )}
                    <time className="whitespace-nowrap" dateTime={entry.occurred_at} title={formatDateTime(entry.occurred_at)}>{timeAgo(entry.occurred_at)}</time>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
