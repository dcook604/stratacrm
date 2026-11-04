import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/** Opens a page's "create" form when it is reached via `?new=1` (dashboard quick actions), then clears the param. */
export function useOpenCreate(open: () => void) {
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    if (sp.get("new") === "1") {
      open();
      setSp((prev) => { const n = new URLSearchParams(prev); n.delete("new"); return n; }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
