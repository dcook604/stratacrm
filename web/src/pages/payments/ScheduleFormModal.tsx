import MoneyInput from "../../components/ui/MoneyInput";
import { useState } from "react";
import { LotPicker, PartyPicker } from "../../components/ui/EntityPicker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { paymentsApi } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Modal } from "./shared";

// ---------------------------------------------------------------------------
// Schedule Form Modal
// ---------------------------------------------------------------------------

export function ScheduleFormModal({ scheduleId, onClose }: { scheduleId?: number; onClose: () => void }) {
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
