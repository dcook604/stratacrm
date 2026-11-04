import { todayLocal } from "../../lib/dates";
import MoneyInput from "../../components/ui/MoneyInput";
import { useState } from "react";
import { type PaymentRecord } from "../../lib/api";
import { Modal } from "./shared";

// ---------------------------------------------------------------------------
// Record Payment Modal
// ---------------------------------------------------------------------------

export function RecordPaymentModal({ payment, onClose, onRecord, loading }: {
  payment: PaymentRecord;
  onClose: () => void;
  onRecord: (body: any) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState(payment.amount_due);
  const [paidDate, setPaidDate] = useState(todayLocal());
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
