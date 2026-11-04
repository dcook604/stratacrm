import { TableSkeleton, TableMessage, EmptyState, ErrorState } from "../../components/ui/States";
import { useState } from "react";
import { useListParams } from "../../hooks/useListParams";
import SearchInput from "../../components/ui/SearchInput";
import Pagination from "../../components/ui/Pagination";
import ActiveFilters from "../../components/ui/ActiveFilters";
import { SortButton } from "../../components/ui/SortHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Plus, Check, Mail, Calendar } from "lucide-react";
import { formatDate } from "../../lib/utils";
import { paymentsApi, type PaymentRecord, type PaymentStatus as PStatus, type PaymentMethod } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { STATUS_CLASSES, STATUS_LABELS } from "./constants";
import { Th } from "./shared";
import { RecordPaymentModal } from "./RecordPaymentModal";
import { CreatePaymentModal } from "./CreatePaymentModal";

// ---------------------------------------------------------------------------
// Payments Tab
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = ["pending", "overdue", "paid", "partially_paid", "cancelled"] as const;


export function PaymentsTab() {
  const { values, page, setPage, update, clearAll } = useListParams({ q: "", status: "", sort: "due:desc", size: "50" });
  const statusFilter = values.status as PStatus | "";
  const searchQuery = values.q;
  const sort = values.sort;
  const pageSize = Number(values.size) || 50;
  const [recordModal, setRecordModal] = useState<{ payment: PaymentRecord } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { addToast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", { statusFilter, searchQuery, sort, page, pageSize }],
    queryFn: () => paymentsApi.list({
      status: statusFilter || undefined,
      search: searchQuery || undefined,
      sort,
      skip: page * pageSize,
      limit: pageSize,
    }),
    placeholderData: (prev) => prev,
  });
  const filtered = data?.items;

  const recordMutation = useMutation({
    mutationFn: (body: { id: number; amount_paid: string; paid_date: string; payment_method?: PaymentMethod; reference_number?: string; notes?: string }) =>
      paymentsApi.record(body.id, body as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
      addToast("success", "Payment recorded");
      setRecordModal(null);
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  const notifyMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.sendNotification(id),
    onSuccess: (data) => {
      addToast("success", `Notification sent to ${data.recipient_email}`);
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchQuery}
          onChange={(v) => update({ q: v })}
          placeholder="Search by lot, unit, or party…"
          className="flex-1 min-w-[200px] max-w-md"
        />

        <select
          className="input w-auto min-w-[140px]"
          value={statusFilter}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {PAYMENT_STATUSES.map((st) => (
            <option key={st} value={st}>{STATUS_LABELS[st]}</option>
          ))}
        </select>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="btn-primary flex items-center gap-2 ml-auto"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      <ActiveFilters
        chips={[
          ...(searchQuery ? [{ label: `Search: “${searchQuery}”`, onRemove: () => update({ q: "" }) }] : []),
          ...(statusFilter ? [{ label: `Status: ${STATUS_LABELS[statusFilter]}`, onRemove: () => update({ status: "" }) }] : []),
        ]}
        onClearAll={clearAll}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-scroll">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <Th>Lot</Th>
              <Th>Party</Th>
              <Th><SortButton label="Amount Due" sortKey="amount" sort={sort} onSort={(v) => update({ sort: v })} firstDir="desc" /></Th>
              <Th>Paid</Th>
              <Th><SortButton label="Due Date" sortKey="due" sort={sort} onSort={(v) => update({ sort: v })} firstDir="desc" /></Th>
              <Th><SortButton label="Status" sortKey="status" sort={sort} onSort={(v) => update({ sort: v })} /></Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton columns={7} />
            ) : error ? (
              <TableMessage columns={7}>
                <ErrorState message="Failed to load payments." onRetry={() => refetch()} />
              </TableMessage>
            ) : filtered?.length === 0 ? (
              <TableMessage columns={7}>
                {searchQuery || statusFilter ? (
                  <EmptyState
                    icon={DollarSign}
                    title="No payments match these filters"
                    action={<button className="btn-secondary text-xs px-3 py-1.5" onClick={clearAll}>Clear all filters</button>}
                  />
                ) : (
                  <EmptyState
                    icon={DollarSign}
                    title="No payment records yet"
                    hint="Records are created from schedules, or add a one-off payment."
                    action={<button className="btn-primary text-xs px-3 py-1.5" onClick={() => setCreateModalOpen(true)}><Plus className="w-3.5 h-3.5" /> Record Payment</button>}
                  />
                )}
              </TableMessage>
            ) : (
              filtered?.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-sm">
                    <span className="font-medium text-slate-900">
                      SL{p.lot.strata_lot_number}
                    </span>
                    {p.lot.unit_number && (
                      <span className="text-slate-500 ml-1">({p.lot.unit_number})</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-slate-700">{p.party.full_name}</td>
                  <td className="p-3 text-sm font-medium text-slate-900">
                    ${parseFloat(p.amount_due).toFixed(2)}
                  </td>
                  <td className="p-3 text-sm text-slate-700">
                    {p.amount_paid !== "0" ? `$${parseFloat(p.amount_paid).toFixed(2)}` : "—"}
                  </td>
                  <td className="p-3 text-sm text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {formatDate(p.due_date)}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={STATUS_CLASSES[p.status]}>{STATUS_LABELS[p.status]}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {p.status === "pending" || p.status === "overdue" || p.status === "partially_paid" ? (
                        <>
                          <button
                            onClick={() => setRecordModal({ payment: p })}
                            className="p-1.5 rounded hover:bg-green-100 text-green-700 transition-colors"
                            title="Record payment"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => notifyMutation.mutate(p.id)}
                            disabled={notifyMutation.isPending}
                            className="p-1.5 rounded hover:bg-blue-100 text-blue-700 transition-colors"
                            title="Send notification"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
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

      {/* Record Payment Modal */}
      {recordModal && (
        <RecordPaymentModal
          payment={recordModal.payment}
          onClose={() => setRecordModal(null)}
          onRecord={(body) => recordMutation.mutate(body)}
          loading={recordMutation.isPending}
        />
      )}

      {/* Create Payment Modal */}
      {createModalOpen && (
        <CreatePaymentModal
          onClose={() => setCreateModalOpen(false)}
        />
      )}
    </div>
  );
}
