import MoneyInput from "../components/ui/MoneyInput";
import { TableSkeleton, TableMessage, EmptyState, ErrorState } from "../components/ui/States";
import { useDialog } from "../hooks/useDialog";
import { useState, useEffect } from "react";
import { useListParams } from "../hooks/useListParams";
import SearchInput from "../components/ui/SearchInput";
import Pagination from "../components/ui/Pagination";
import ActiveFilters from "../components/ui/ActiveFilters";
import { SortButton } from "../components/ui/SortHeader";
import { LotPicker, PartyPicker } from "../components/ui/EntityPicker";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Plus, X, Check,
  Mail, Calendar,
  Settings, List, Receipt,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import { paymentsApi, type PaymentConfig, type PaymentRecord, type PaymentStatus as PStatus, type PaymentMethod } from "../lib/api";
import { useToast } from "../lib/toast";

type Tab = "payments" | "schedules" | "config";

const STATUS_LABELS: Record<PStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  partially_paid: "Partial",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<PStatus, string> = {
  pending: "badge badge-blue",
  paid: "badge badge-green",
  overdue: "badge badge-red",
  partially_paid: "badge badge-amber",
  cancelled: "badge badge-slate",
};

const TABS: Tab[] = ["payments", "schedules", "config"];

export default function PaymentsPage() {
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "payments";
  // Switching tabs drops the other tab's filters; push so Back returns to the previous tab.
  const setTab = (t: Tab) => setSp(t === "payments" ? {} : { tab: t });

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track locker rental payments and manage notification schedules
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: "payments" as Tab, label: "Payment Records", icon: Receipt },
          { id: "schedules" as Tab, label: "Schedules", icon: List },
          { id: "config" as Tab, label: "Settings", icon: Settings },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "payments" && <PaymentsTab />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments Tab
// ---------------------------------------------------------------------------

const PAYMENT_STATUSES = ["pending", "overdue", "paid", "partially_paid", "cancelled"] as const;

function PaymentsTab() {
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

// ---------------------------------------------------------------------------
// Record Payment Modal
// ---------------------------------------------------------------------------

function RecordPaymentModal({ payment, onClose, onRecord, loading }: {
  payment: PaymentRecord;
  onClose: () => void;
  onRecord: (body: any) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState(payment.amount_due);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState<string>("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onRecord({
      id: payment.id,
      amount_paid: amount,
      paid_date: paidDate,
      payment_method: method || undefined,
      reference_number: ref || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <Modal onClose={onClose} title="Record Payment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm text-slate-500 mb-3">
            Recording payment for <strong>{payment.party.full_name}</strong> —
            SL{payment.lot.strata_lot_number}{payment.lot.unit_number ? ` (${payment.lot.unit_number})` : ""}
          </p>
          <p className="text-sm text-slate-500 mb-3">
            Amount Due: <strong>${parseFloat(payment.amount_due).toFixed(2)}</strong>
          </p>
        </div>

        <div>
          <label className="label">Amount Paid</label>
          <MoneyInput value={amount} onChange={setAmount} required />
        </div>

        <div>
          <label className="label">Paid Date</label>
          <input type="date" className="input" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
        </div>

        <div>
          <label className="label">Payment Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Select method</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="etransfer">E-Transfer</option>
            <option value="direct_deposit">Direct Deposit</option>
            <option value="credit_card">Credit Card</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="label">Reference Number (cheque #, etransfer ref)</label>
          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Create Payment Modal
// ---------------------------------------------------------------------------

function CreatePaymentModal({ onClose }: { onClose: () => void }) {
  const [scheduleId, setScheduleId] = useState("");
  const [lotId, setLotId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const { addToast } = useToast();
  const qc = useQueryClient();

  const { data: schedulesPage } = useQuery({
    queryKey: ["schedules-brief", lotId],
    queryFn: () => paymentsApi.listSchedules({ active_only: true, limit: 200, lot_id: lotId ? Number(lotId) : undefined }),
  });
  const schedules = schedulesPage?.items;

  const createMutation = useMutation({
    mutationFn: (body: object) => paymentsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      addToast("success", "Payment record created");
      onClose();
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      payment_schedule_id: parseInt(scheduleId),
      lot_id: parseInt(lotId),
      party_id: parseInt(partyId),
      amount_due: amount,
      due_date: dueDate,
      notes: notes || undefined,
    });
  }

  return (
    <Modal onClose={onClose} title="Create Payment Record">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Lot</label>
          <LotPicker value={lotId} onChange={(id) => { setLotId(id); setScheduleId(""); }} required />
        </div>

        <div>
          <label className="label">Party</label>
          <PartyPicker value={partyId} onChange={(id) => setPartyId(id)} required />
        </div>

        <div>
          <label className="label">Schedule</label>
          <select className="input" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} required>
            <option value="">{lotId ? "Select schedule..." : "Select a lot first..."}</option>
            {schedules?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.description} — SL{s.lot.strata_lot_number}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Amount Due</label>
          <MoneyInput value={amount} onChange={setAmount} required />
        </div>

        <div>
          <label className="label">Due Date</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Schedules Tab
// ---------------------------------------------------------------------------

function SchedulesTab() {
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

// ---------------------------------------------------------------------------
// Schedule Form Modal
// ---------------------------------------------------------------------------

function ScheduleFormModal({ scheduleId, onClose }: { scheduleId?: number; onClose: () => void }) {
  const isEdit = !!scheduleId;
  const [lotId, setLotId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [billingDay, setBillingDay] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { addToast } = useToast();
  const qc = useQueryClient();

  // Load existing schedule for editing
  const { data: existing } = useQuery({
    queryKey: ["payment-schedule", scheduleId],
    queryFn: () => paymentsApi.getSchedule(scheduleId!),
    enabled: isEdit,
  });

  // Populate form from existing data
  if (isEdit && existing && !lotId) {
    setLotId(String(existing.lot.id));
    setPartyId(String(existing.party.id));
    setDescription(existing.description);
    setAmount(existing.amount);
    setFrequency(existing.frequency);
    setBillingDay(String(existing.billing_day));
    setStartDate(existing.start_date);
    setEndDate(existing.end_date || "");
  }

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      isEdit ? paymentsApi.updateSchedule(scheduleId, body) : paymentsApi.createSchedule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      addToast("success", isEdit ? "Schedule updated" : "Schedule created");
      onClose();
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      lot_id: parseInt(lotId),
      party_id: parseInt(partyId),
      description,
      amount,
      frequency,
      billing_day: parseInt(billingDay),
      start_date: startDate,
      end_date: endDate || null,
    });
  }

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit Schedule" : "New Payment Schedule"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Locker L-001 Monthly Rental" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Lot</label>
            <LotPicker
              value={lotId}
              label={existing ? `SL${existing.lot.strata_lot_number}${existing.lot.unit_number ? ` (${existing.lot.unit_number})` : ""}` : undefined}
              onChange={(id) => setLotId(id)}
              required
            />
          </div>
          <div>
            <label className="label">Party (Renter)</label>
            <PartyPicker value={partyId} label={existing?.party.full_name} onChange={(id) => setPartyId(id)} required />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Amount</label>
            <MoneyInput value={amount} onChange={setAmount} required />
          </div>
          <div>
            <label className="label">Frequency</label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="label">Billing Day</label>
            <input type="number" min={1} max={31} className="input" value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">End Date (optional)</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? "Saving..." : isEdit ? "Update" : "Create Schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Config Tab
// ---------------------------------------------------------------------------

function ConfigTab() {
  const { addToast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["payment-config"],
    queryFn: () => paymentsApi.getConfig(),
  });

  const [form, setForm] = useState<PaymentConfig | null>(null);

  useEffect(() => {
    if (config && !form) {
      setForm(config);
    }
  }, [config, form]);

  const updateMutation = useMutation({
    mutationFn: (body: Partial<PaymentConfig>) => paymentsApi.updateConfig(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-config"] });
      addToast("success", "Payment settings saved");
    },
    onError: (err: Error) => addToast("error", err.message),
  });

  if (isLoading || !form) {
    return <div className="text-center text-slate-500 text-sm py-8">Loading...</div>;
  }

  function setField<K extends keyof PaymentConfig>(key: K, value: PaymentConfig[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  function handleSave() {
    if (!form) return;
    updateMutation.mutate(form);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Advance Notice */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-1">Advance Notice</h3>
        <p className="text-sm text-slate-500 mb-4">
          How many days before a payment is due should the first notice be sent?
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={7}
            max={90}
            value={form.advance_notice_days}
            onChange={(e) => setField("advance_notice_days", parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium text-slate-700 min-w-[3rem] text-right">
            {form.advance_notice_days} days
          </span>
        </div>
      </div>

      {/* Additional Reminder Days */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-1">Additional Reminders</h3>
        <p className="text-sm text-slate-500 mb-4">
          Send additional reminders at these days before due (in addition to the advance notice).
        </p>
        <ReminderDaysInput
          value={form.additional_reminder_days}
          onChange={(v) => setField("additional_reminder_days", v)}
        />
      </div>

      {/* Past Due Notices */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-1">Past Due Notices</h3>
        <p className="text-sm text-slate-500 mb-4">
          Send overdue notices at these days past due.
        </p>
        <ReminderDaysInput
          value={form.past_due_notice_days}
          onChange={(v) => setField("past_due_notice_days", v)}
        />
      </div>

      {/* Late Fee / Grace Period */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 mb-1">Late Fees & Grace Period</h3>
        <p className="text-sm text-slate-500 mb-4">
          Optional late fee and grace period configuration.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Late Fee Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                className="input pl-7"
                type="number"
                step="0.01"
                min="0"
                value={form.late_fee_amount ?? ""}
                onChange={(e) => setField("late_fee_amount", e.target.value ? e.target.value : null as any)}
                placeholder="No late fee"
              />
            </div>
          </div>
          <div>
            <label className="label">Grace Period (days)</label>
            <input
              type="number"
              min={0}
              max={365}
              className="input"
              value={form.grace_period_days}
              onChange={(e) => setField("grace_period_days", parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={updateMutation.isPending} className="btn-primary">
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reminder Days Input
// ---------------------------------------------------------------------------

function ReminderDaysInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [input, setInput] = useState("");

  function addDay() {
    const d = parseInt(input);
    if (isNaN(d) || d < 1 || d > 365) return;
    if (value.includes(d)) return;
    onChange([...value, d].sort((a, b) => b - a));
    setInput("");
  }

  function removeDay(d: number) {
    onChange(value.filter((v) => v !== d));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {value.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
            {d} days
            <button onClick={() => removeDay(d)} className="hover:text-blue-900">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="e.g. 14"
          type="number"
          min={1}
          max={365}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDay())}
        />
        <button type="button" onClick={addDay} className="btn-secondary text-sm">
          Add
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1">Press Enter or click Add. Sorted descending.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{children}</th>;
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const dialogRef = useDialog(onClose);
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
