import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { paymentsApi, type PaymentConfig } from "../../lib/api";
import { useToast } from "../../lib/toast";

// ---------------------------------------------------------------------------
// Config Tab
// ---------------------------------------------------------------------------

export function ConfigTab() {
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

export function ReminderDaysInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
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
