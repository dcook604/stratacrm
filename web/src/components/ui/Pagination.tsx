import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface Props {
  /** 0-based current page */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: number[];
}

function pageList(current: number, last: number): (number | "…")[] {
  const pages = new Set<number>([0, last, current, current - 1, current + 1, current - 2, current + 2]);
  const sorted = [...pages].filter((p) => p >= 0 && p <= last).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizes = [10, 25, 50, 100] }: Props) {
  if (total === 0) return null;
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  const current = Math.min(page, last);
  const from = current * pageSize + 1;
  const to = Math.min((current + 1) * pageSize, total);
  const btn = "btn-secondary px-2 py-1.5 disabled:opacity-40";

  return (
    <div className="px-4 py-3 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between text-sm gap-2">
      <div className="flex items-center gap-3 text-slate-500">
        <span>
          Showing {from}–{to} of {total}
        </span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="input py-1 w-auto"
              aria-label="Rows per page"
            >
              {[...new Set([...pageSizes, pageSize])].sort((a, b) => a - b).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {last > 0 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button className={btn} disabled={current === 0} onClick={() => onPage(0)} aria-label="First page">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button className={btn} disabled={current === 0} onClick={() => onPage(current - 1)} aria-label="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageList(current, last).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-500">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === current ? "page" : undefined}
                className={
                  p === current
                    ? "px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-sm font-medium"
                    : "px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 text-sm"
                }
              >
                {p + 1}
              </button>
            ),
          )}
          <button className={btn} disabled={current >= last} onClick={() => onPage(current + 1)} aria-label="Next page">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className={btn} disabled={current >= last} onClick={() => onPage(last)} aria-label="Last page">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
