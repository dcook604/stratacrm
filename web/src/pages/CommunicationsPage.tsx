import { Mail } from "lucide-react";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
          <p className="text-slate-500 text-sm mt-1">
            Compose and send emails to owner segments via Listmonk
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-700 mb-2">Coming Soon</h2>
        <p className="text-slate-500 text-sm max-w-md mx-auto">
          The communications module will let you compose emails, send to
          owner/tenant segments, and view broadcast history — all synced
          through Listmonk.
        </p>
      </div>
    </div>
  );
}
