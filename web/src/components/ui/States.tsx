import type { ComponentType, ReactNode } from "react";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";

/** Skeleton rows for a table body. */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse" aria-hidden>
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-slate-100 rounded w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A full-width table row for empty / error / loading messages. */
export function TableMessage({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-10 text-center">{children}</td>
    </tr>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon className="w-8 h-8 text-slate-300" />
      <p className="text-slate-600 font-medium text-sm">{title}</p>
      {hint && <p className="text-slate-500 text-xs">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center" role="alert">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-red-700 text-sm font-medium">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}
