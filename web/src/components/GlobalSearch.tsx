import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, Users, AlertTriangle, FileText, Wrench, Loader2 } from "lucide-react";
import { searchApi } from "../lib/api";

interface Ctx {
  open: () => void;
}
const SearchCtx = createContext<Ctx>({ open: () => {} });
export const useGlobalSearch = () => useContext(SearchCtx);

interface Hit {
  key: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  to: string;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key === "/" && !isTyping(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <SearchCtx.Provider value={value}>
      {children}
      {isOpen && <SearchDialog onClose={() => setIsOpen(false)} />}
    </SearchCtx.Provider>
  );
}

export function SearchTrigger({ className = "" }: { className?: string }) {
  const { open } = useGlobalSearch();
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={open}
      className={`flex items-center gap-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 py-2 transition-colors ${className}`}
      aria-label="Search everything"
    >
      <Search className="w-4 h-4" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="hidden lg:inline text-[10px] text-slate-500 border border-slate-600 rounded px-1">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching, error } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => searchApi.search(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

  const hits: Hit[] = useMemo(() => {
    if (!data || q.length < 2) return [];
    return [
      ...data.lots.map((l): Hit => ({
        key: `lot${l.id}`, group: "Lots", icon: Building2,
        title: `Lot ${l.strata_lot_number}`, subtitle: l.unit_number ? `Unit ${l.unit_number}` : undefined,
        to: `/lots/${l.id}`,
      })),
      ...data.parties.map((p): Hit => ({
        key: `party${p.id}`, group: "Parties", icon: Users,
        title: p.full_name, subtitle: p.email ?? p.party_type, to: `/parties/${p.id}`,
      })),
      ...data.infractions.map((i): Hit => ({
        key: `inf${i.id}`, group: "Infractions", icon: AlertTriangle,
        title: `Lot ${i.lot_number ?? "?"} — ${i.bylaw_description ?? "Infraction"}`,
        subtitle: [i.party_name, i.status.replace(/_/g, " ")].filter(Boolean).join(" · "),
        to: `/infractions/${i.id}`,
      })),
      ...data.incidents.map((i): Hit => ({
        key: `inc${i.id}`, group: "Incidents", icon: FileText,
        title: i.reference ?? `Incident #${i.id}`, subtitle: i.description ?? undefined,
        to: `/incidents?open=${i.id}`,
      })),
      ...data.issues.map((i): Hit => ({
        key: `iss${i.id}`, group: "Issues", icon: Wrench,
        title: i.title, subtitle: i.status.replace(/_/g, " "), to: `/issues?open=${i.id}`,
      })),
    ];
  }, [data, q]);

  useEffect(() => setActive(0), [hits.length, q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(h: Hit) {
    onClose();
    navigate(h.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 px-4 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search lots, people, infractions, incidents, issues…"
            className="flex-1 py-3.5 text-sm outline-none bg-transparent"
          />
          {isFetching && <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />}
          <kbd className="text-[10px] text-slate-500 border border-slate-200 rounded px-1">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {q.length < 2 && (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">
              Type at least 2 characters. Supports "exact phrases", OR and -exclude.
            </p>
          )}
          {error && <p className="px-4 py-6 text-sm text-red-600 text-center">Search failed. Try again.</p>}
          {q.length >= 2 && !error && !isFetching && hits.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">No results for “{q}”.</p>
          )}
          {hits.map((h, idx) => {
            const header = h.group !== lastGroup;
            lastGroup = h.group;
            const Icon = h.icon;
            return (
              <div key={h.key}>
                {header && (
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h.group}</p>
                )}
                <button
                  type="button"
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(h)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left ${idx === active ? "bg-blue-50" : ""}`}
                >
                  <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-900 truncate">{h.title}</span>
                    {h.subtitle && <span className="block text-xs text-slate-500 truncate">{h.subtitle}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
