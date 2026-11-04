import { useDialog } from "../../hooks/useDialog";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{children}</th>;
}


export function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const dialogRef = useDialog(onClose);
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
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
