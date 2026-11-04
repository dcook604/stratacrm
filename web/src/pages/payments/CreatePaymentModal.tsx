import MoneyInput from "../../components/ui/MoneyInput";
import { useState } from "react";
import { LotPicker, PartyPicker } from "../../components/ui/EntityPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { paymentsApi } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Modal } from "./shared";

// ---------------------------------------------------------------------------
// Create Payment Modal
// ---------------------------------------------------------------------------

export function CreatePaymentModal({ onClose }: { onClose: () => void }) {
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
