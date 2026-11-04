import { useState } from "react";
import { useListParams } from "../../hooks/useListParams";
import SearchInput from "../../components/ui/SearchInput";
import Pagination from "../../components/ui/Pagination";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus, Calendar } from "lucide-react";
import { formatDate } from "../../lib/utils";
import { paymentsApi } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { ScheduleFormModal } from "./ScheduleFormModal";

// ---------------------------------------------------------------------------
// Schedules Tab
// ---------------------------------------------------------------------------

export function SchedulesTab() {
  const { values, page, setPage, update } = useListParams({ q: "", size: "20" });
  const search = values.q;
  const pageSize = Number(values.size) || 20;
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const { addToast } = useToast();
  const qc = useQueryClient();

  const { data: schedulesPage, isLoading } = useQuery({
    queryKey: ["payment-schedules", { search, page, pageSize }],
    queryFn: () => paymentsApi.listSchedules({
      active_only: true,
      search: search || undefined,
      skip: page * pageSize,
      limit: pageSize,
    }),
    placeholderData: (prev) => prev,
  });
  const schedules = schedulesPage?.items;
  const scheduleTotal = schedulesPage?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.deleteSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
      addToast("success", "Schedule deactivated");
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={(v) => update({ q: v })}
          placeholder="Search schedules, lots, or parties…"
          className="flex-1 min-w-[200px] max-w-md"
        />
        <p className="text-sm text-slate-500">
          {scheduleTotal} active schedule{scheduleTotal !== 1 ? "s" : ""}
        </p>
        <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center text-slate-500 text-sm py-8">Loading...</div>
        ) : schedules?.length === 0 ? (
          <div className="card p-8 text-center">
            <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No payment schedules created yet.</p>
            <p className="text-slate-500 text-xs mt-1">
              Create a schedule to start tracking locker rental payments.
            </p>
          </div>
        ) : (
          schedules?.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-900">{s.description}</h3>
                    {!s.is_active && <span className="badge badge-slate">Inactive</span>}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    SL{s.lot.strata_lot_number}{s.lot.unit_number ? ` (${s.lot.unit_number})` : ""}
                    {" — "}{s.party.full_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-900">${parseFloat(s.amount).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 capitalize">{s.frequency}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                <span>Billing day: {s.billing_day}</span>
                {s.next_due_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Next due: {formatDate(s.next_due_date)}
                  </span>
                )}
                {parseFloat(s.outstanding_balance) > 0 && (
                  <span className="text-amber-600 font-medium">
                    Outstanding: ${parseFloat(s.outstanding_balance).toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setEditId(s.id)}
                  className="btn-secondary text-xs py-1 px-3"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteMutation.mutate(s.id)}
                  className="btn text-xs py-1 px-3 text-red-600"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={scheduleTotal}
          onPage={setPage}
          onPageSize={(n) => update({ size: String(n) })}
          pageSizes={[10, 20, 50]}
        />
      </div>

      {createOpen && (
        <ScheduleFormModal onClose={() => setCreateOpen(false)} />
      )}
      {editId && (
        <ScheduleFormModal scheduleId={editId} onClose={() => setEditId(null)} />
      )}
    </div>
  );
}
