import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

type UpdateOpts = {
  /** Reset to the first page (default true). Ignored when the patch sets `page`. */
  resetPage?: boolean;
  /** Add a history entry instead of replacing the current one. */
  push?: boolean;
};

/**
 * Keeps list state (search, filters, sort, page) in the URL query string so the
 * browser Back button, bookmarks and shared links all restore the exact view.
 *
 * Values equal to their default are omitted from the URL. `page` is stored
 * 1-based in the URL and exposed 0-based here.
 */
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const [sp, setSp] = useSearchParams();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const values = useMemo(() => {
    const out: Record<string, string> = { ...defaultsRef.current };
    sp.forEach((v, k) => {
      if (k in defaultsRef.current) out[k] = v;
    });
    return out as T;
  }, [sp]);

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1) - 1;

  const update = useCallback(
    (patch: Partial<Record<string, string>>, opts: UpdateOpts = {}) => {
      const { resetPage = true, push = false } = opts;
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "" || v === defaultsRef.current[k]) next.delete(k);
            else next.set(k, v as string);
          }
          if (resetPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: !push },
      );
    },
    [setSp],
  );

  const setPage = useCallback(
    (p: number) => update({ page: p > 0 ? String(p + 1) : "" }, { push: true, resetPage: false }),
    [update],
  );

  /** Reset every managed filter back to its default (leaves unrelated params such as `open`). */
  const clearAll = useCallback(() => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of Object.keys(defaultsRef.current)) next.delete(k);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [setSp]);

  return { values, page, setPage, update, clearAll };
}
