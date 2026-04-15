import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronLeft, FileText, Send, CheckCircle,
  XCircle, Clock, Mail, MessageSquare, Gavel, DollarSign, Plus,
} from "lucide-react";
import {
  infractionsApi,
  type InfractionDetail,
  type InfractionEvent,
  type InfractionEventType,
  type InfractionStatus,
  type DeliveryMethod,
} from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<InfractionStatus, string> = {
  open: "Open",
  notice_sent: "Notice Sent",
  response_received: "Response Received",
  hearing_scheduled: "Hearing Scheduled",
  fined: "Fined",
  dismissed: "Dismissed",
  appealed: "Appealed",
};

const STATUS_COLOURS: Record<InfractionStatus, string> = {
  open: "badge-amber",
  notice_sent: "badge-blue",
  response_received: "badge-blue",
  hearing_scheduled: "badge-amber",
  fined: "badge-red",
  dismissed: "badge-slate",
  appealed: "badge-amber",
};

const EVENT_LABELS: Record<InfractionEventType, string> = {
  complaint_received: "Complaint Received",
  notice_sent: "Notice Sent",
  response_received: "Response Received",
  hearing_held: "Hearing Held",
  decision_made: "Decision Made",
  fine_levied: "Fine Levied",
  payment_received: "Payment Received",
  dismissed: "Dismissed",
};

function EventIcon({ type }: { type: InfractionEventType }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "complaint_received": return <AlertTriangle className={`${cls} text-amber-500`} />;
    case "notice_sent": return <Send className={`${cls} text-blue-500`} />;
    case "response_received": return <MessageSquare className={`${cls} text-blue-500`} />;
    case "hearing_held": return <Gavel className={`${cls} text-purple-500`} />;
    case "decision_made": return <CheckCircle className={`${cls} text-slate-500`} />;
    case "fine_levied": return <DollarSign className={`${cls} text-red-500`} />;
    case "payment_received": return <CheckCircle className={`${cls} text-green-500`} />;
    case "dismissed": return <XCircle className={`${cls} text-slate-400`} />;
    default: return <Clock className={`${cls} text-slate-400`} />;
  }
}

// Which event types are allowed given a current status (mirrors backend _TRANSITIONS)
const ALLOWED_EVENTS: Record<InfractionStatus, InfractionEventType[]> = {
  open: ["dismissed"],
  notice_sent: ["response_received", "hearing_held", "decision_made", "fine_levied", "dismissed"],
  response_received: ["hearing_held", "decision_made", "fine_levied", "dismissed"],
  hearing_scheduled: ["hearing_held", "decision_made", "fine_levied", "dismissed"],
  fined: ["payment_received"],
  dismissed: [],
  appealed: [],
};

// ---------------------------------------------------------------------------
// Add event form
// ---------------------------------------------------------------------------

interface AddEventProps {
  infractionId: number;
  currentStatus: InfractionStatus;
  onDone: () => void;
}

function AddEventForm({ infractionId, currentStatus, onDone }: AddEventProps) {
  const qc = useQueryClient();
  const allowed = ALLOWED_EVENTS[currentStatus] ?? [];
  const [eventType, setEventType] = useState<InfractionEventType>(allowed[0] ?? "dismissed");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      infractionsApi.addEvent(infractionId, {
        event_type: eventType,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["infraction", infractionId] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        No further events can be added in this status.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
      )}
      <div>
        <label className="label">Event Type</label>
        <select
          className="input"
          value={eventType}
          onChange={(e) => setEventType(e.target.value as InfractionEventType)}
        >
          {allowed.map((t) => (
            <option key={t} value={t}>{EVENT_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea
          className="input min-h-[80px] resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context or notes for this event…"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="btn btn-secondary">Cancel</button>
        <button
          className="btn btn-primary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Recording…" : "Record Event"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice generation panel
// ---------------------------------------------------------------------------

interface NoticeGenProps {
  inf: InfractionDetail;
  onDone: () => void;
}

function GenerateNoticePanel({ inf, onDone }: NoticeGenProps) {
  const qc = useQueryClient();
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("email");
  const [sendEmail, setSendEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      infractionsApi.generateNotice(inf.id, {
        delivery_method: deliveryMethod,
        send_email: deliveryMethod === "email" ? sendEmail : false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["infraction", inf.id] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (inf.status !== "open") {
    return (
      <p className="text-sm text-slate-400 italic">
        Notice can only be generated when the infraction is in <strong>Open</strong> status.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
      )}
      <p className="text-sm text-slate-600">
        Generates a s.135 notice PDF (WeasyPrint) and advances status to <strong>Notice Sent</strong>.
      </p>
      <div>
        <label className="label">Delivery Method</label>
        <select
          className="input w-52"
          value={deliveryMethod}
          onChange={(e) => setDeliveryMethod(e.target.value as DeliveryMethod)}
        >
          <option value="email">Email</option>
          <option value="registered_mail">Registered Mail</option>
          <option value="posted">Posted (common area)</option>
        </select>
      </div>
      {deliveryMethod === "email" && (
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          Send email to party's primary email address
        </label>
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={onDone} className="btn btn-secondary">Cancel</button>
        <button
          className="btn btn-primary"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Generating…" : "Generate & Send Notice"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------

function EventTimeline({ events }: { events: InfractionEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  return (
    <ol className="relative border-l border-slate-200 space-y-4 pl-6">
      {sorted.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[25px] flex items-center justify-center w-5 h-5 bg-white border border-slate-200 rounded-full">
            <EventIcon type={ev.event_type} />
          </span>
          <div className="card px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">{EVENT_LABELS[ev.event_type]}</p>
              <p className="text-xs text-slate-400">
                {new Date(ev.occurred_at).toLocaleDateString("en-CA", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </p>
            </div>
            {ev.actor_email && (
              <p className="text-xs text-slate-400 mb-1">{ev.actor_email}</p>
            )}
            {ev.notes && (
              <p className="text-sm text-slate-600">{ev.notes}</p>
            )}
            {ev.document_id && (
              <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Document attached
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function InfractionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const infractionId = Number(id);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showNoticeGen, setShowNoticeGen] = useState(false);

  const { data: inf, isLoading, error } = useQuery({
    queryKey: ["infraction", infractionId],
    queryFn: () => infractionsApi.get(infractionId),
    enabled: !!infractionId,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-400">Loading…</div>
    );
  }

  if (error || !inf) {
    return (
      <div className="p-6 text-sm text-red-600">
        Could not load infraction. <Link to="/infractions" className="text-blue-600 underline">Back to list</Link>
      </div>
    );
  }

  const lotLabel = `SL${inf.lot.strata_lot_number}${inf.lot.unit_number ? ` — Unit ${inf.lot.unit_number}` : ""}`;
  const isResolved = inf.status === "fined" || inf.status === "dismissed" || inf.status === "appealed";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div>
        <Link
          to="/infractions"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Infractions
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">
                INF-{inf.id}
              </h1>
              <span className={`badge ${STATUS_COLOURS[inf.status]}`}>
                {STATUS_LABELS[inf.status]}
              </span>
              {inf.occurrence_number > 1 && (
                <span className="badge badge-red text-xs">
                  Occurrence #{inf.occurrence_number}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {lotLabel} · {inf.primary_party.full_name}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap justify-end">
            {inf.status === "open" && !showNoticeGen && (
              <button
                className="btn btn-primary"
                onClick={() => { setShowNoticeGen(true); setShowAddEvent(false); }}
              >
                <Send className="w-4 h-4 mr-1.5" />Generate Notice
              </button>
            )}
            {!isResolved && !showAddEvent && inf.status !== "open" && (
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddEvent(true); setShowNoticeGen(false); }}
              >
                <Plus className="w-4 h-4 mr-1.5" />Record Event
              </button>
            )}
            {inf.status === "fined" && !showAddEvent && (
              <button
                className="btn btn-secondary"
                onClick={() => { setShowAddEvent(true); setShowNoticeGen(false); }}
              >
                <DollarSign className="w-4 h-4 mr-1.5" />Record Payment
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline action panels */}
      {showNoticeGen && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />Generate s.135 Notice
          </h3>
          <GenerateNoticePanel inf={inf} onDone={() => setShowNoticeGen(false)} />
        </div>
      )}
      {showAddEvent && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3">Record Lifecycle Event</h3>
          <AddEventForm
            infractionId={inf.id}
            currentStatus={inf.status}
            onDone={() => setShowAddEvent(false)}
          />
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Bylaw */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Bylaw
            </h3>
            <p className="font-medium text-sm">
              {inf.bylaw.bylaw_number}
              {inf.bylaw.section && <span className="text-slate-400"> § {inf.bylaw.section}</span>}
            </p>
            <p className="text-sm text-slate-600 mt-0.5">{inf.bylaw.title}</p>
            <p className="text-xs text-slate-400 mt-1 capitalize">
              {inf.bylaw.category.replace("_", " ")}
            </p>
          </div>

          {/* Fine */}
          {inf.applicable_fine && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Applicable Fine (Occurrence #{inf.occurrence_number})
              </h3>
              <p className="text-lg font-bold text-red-600">
                ${Number(inf.applicable_fine.fine_amount).toFixed(2)}
              </p>
              {inf.applicable_fine.continuing_contravention_amount && (
                <p className="text-xs text-slate-500 mt-0.5">
                  + ${Number(inf.applicable_fine.continuing_contravention_amount).toFixed(2)}/day continuing
                  {inf.applicable_fine.max_per_week && (
                    <> (max ${Number(inf.applicable_fine.max_per_week).toFixed(2)}/week)</>
                  )}
                </p>
              )}
              {inf.assessed_fine_amount && (
                <p className="text-xs text-green-600 font-medium mt-2">
                  Assessed: ${Number(inf.assessed_fine_amount).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Complaint */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Complaint Details
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Received</dt>
                <dd>{inf.complaint_received_date}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Description</dt>
                <dd className="text-slate-700 whitespace-pre-wrap">{inf.description}</dd>
              </div>
            </dl>
          </div>

          {/* Notices */}
          {inf.notices.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Notices
              </h3>
              <div className="space-y-2">
                {inf.notices.map((n) => (
                  <div key={n.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium capitalize">
                        {n.delivery_method.replace("_", " ")}
                      </p>
                      <p className="text-xs text-slate-400">
                        {n.delivered_at
                          ? new Date(n.delivered_at).toLocaleDateString("en-CA", {
                              year: "numeric", month: "short", day: "numeric",
                            })
                          : new Date(n.created_at).toLocaleDateString("en-CA", {
                              year: "numeric", month: "short", day: "numeric",
                            })}
                      </p>
                    </div>
                    {n.pdf_url && (
                      <a
                        href={n.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
            s.135 Event Trail
          </h3>
          {inf.events.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No events yet.</p>
          ) : (
            <EventTimeline events={inf.events} />
          )}
        </div>
      </div>
    </div>
  );
}

