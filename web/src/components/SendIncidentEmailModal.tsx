import { useState } from "react";
import { Mail, X, Send, Loader2 } from "lucide-react";
import { incidentsApi, type Incident } from "../lib/api";
import { useToast } from "../lib/toast";

interface Props {
  incident: Incident;
  onClose: () => void;
}

export default function SendIncidentEmailModal({ incident, onClose }: Props) {
  const { addToast } = useToast();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const location = incident.lot
    ? `SL${incident.lot.strata_lot_number}${incident.lot.unit_number ? ` Unit ${incident.lot.unit_number}` : ""}`
    : incident.common_area_description ?? "Common area";

  async function handleSend() {
    if (!to.trim()) return;
    setSending(true);
    try {
      await incidentsApi.sendEmail(incident.id, { to: to.trim(), message: message.trim() || undefined });
      addToast("success", `Email sent to ${to.trim()}`);
      onClose();
    } catch (e) {
      addToast("error", (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900 text-sm">Email Incident Report</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Incident summary */}
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-0.5">
            <p className="font-medium text-slate-900">{incident.reference}</p>
            <p className="text-slate-500 text-xs">{location} · {incident.category}</p>
          </div>

          <div>
            <label className="label text-xs">Recipient email <span className="text-red-500">*</span></label>
            <input
              type="email"
              className="input text-sm"
              placeholder="name@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              autoFocus
            />
          </div>

          <div>
            <label className="label text-xs">
              Personal note <span className="text-slate-400 font-normal">(optional — included in email)</span>
            </label>
            <textarea
              className="input text-sm resize-none"
              rows={3}
              placeholder="Add context for the recipient…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <p className="text-xs text-slate-400">
            The email will include incident details, photo thumbnails, and a secure link to view all media (including videos). The link expires in 14 days.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button className="btn btn-secondary text-sm py-1.5" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            className="btn btn-primary text-sm py-1.5 flex items-center gap-1.5"
            onClick={handleSend}
            disabled={sending || !to.trim()}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : "Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
