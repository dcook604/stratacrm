import { useEffect } from "react";

/** Asks the browser to confirm before the tab is closed or reloaded while `active` (e.g. an inline edit form is open). */
export function useUnsavedWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
