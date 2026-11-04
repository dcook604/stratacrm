import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive and focuses Cancel first. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && <ConfirmModal opts={state.opts} onResult={close} />}
    </ConfirmCtx.Provider>
  );
}

function ConfirmModal({ opts, onResult }: { opts: ConfirmOptions; onResult: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previous = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  useEffect(() => {
    (opts.danger ? cancelRef : confirmRef).current?.focus();
    const prev = previous.current;
    return () => prev?.focus?.();
  }, [opts.danger]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onResult(false);
    } else if (e.key === "Tab") {
      const focusables = ref.current?.querySelectorAll<HTMLElement>("button");
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={opts.message ? "confirm-message" : undefined}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50"
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onResult(false); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          {opts.danger && (
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden />
            </div>
          )}
          <div>
            <h2 id="confirm-title" className="font-semibold text-slate-900">{opts.title}</h2>
            {opts.message && <p id="confirm-message" className="text-sm text-slate-600 mt-1">{opts.message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={() => onResult(false)}>
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={opts.danger ? "btn-danger" : "btn-primary"}
            onClick={() => onResult(true)}
          >
            {opts.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
