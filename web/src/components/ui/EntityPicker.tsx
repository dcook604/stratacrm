import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, X } from "lucide-react";
import { lotsApi, partiesApi } from "../../lib/api";

interface Option {
  id: number;
  label: string;
}

interface PickerProps {
  value: string;
  /** Label to show for `value` before the user searches (e.g. when editing). */
  label?: string;
  onChange: (id: string, label: string) => void;
  search: (q: string) => Promise<Option[]>;
  queryKey: string;
  placeholder?: string;
  required?: boolean;
}

/** Search-as-you-type replacement for a `<select>` that would otherwise need every row loaded. */
export function EntityPicker({ value, label, onChange, search, queryKey, placeholder = "Search…", required }: PickerProps) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(label ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (label) setSelectedLabel(label); }, [label]);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data: options, isFetching } = useQuery({
    queryKey: ["picker", queryKey, q],
    queryFn: () => search(q),
    enabled: open,
    staleTime: 30_000,
  });

  function pick(o: Option) {
    setSelectedLabel(o.label);
    setText("");
    setOpen(false);
    onChange(String(o.id), o.label);
  }

  return (
    <div ref={wrapRef} className="relative">
      {value && !open ? (
        <div className="input flex items-center justify-between gap-2 cursor-pointer" onClick={() => setOpen(true)}>
          <span className="truncate">{selectedLabel || `#${value}`}</span>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={(e) => { e.stopPropagation(); setSelectedLabel(""); onChange("", ""); }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            className="input pr-8"
            value={text}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && open && options?.length) { e.preventDefault(); pick(options[0]); }
            }}
          />
          {isFetching ? (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          ) : (
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          )}
        </div>
      )}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 opacity-0 pointer-events-none"
          value={value}
          onChange={() => {}}
          required
        />
      )}
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
          {options?.length === 0 && !isFetching && <li className="px-3 py-2 text-slate-400">No matches</li>}
          {options?.map((o) => (
            <li key={o.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50" onClick={() => pick(o)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Wrapped = Omit<PickerProps, "search" | "queryKey">;

export function LotPicker(props: Wrapped) {
  return (
    <EntityPicker
      {...props}
      queryKey="lots"
      placeholder={props.placeholder ?? "Search SL# or unit…"}
      search={async (q) => {
        const r = await lotsApi.list({ limit: 20, search: q || undefined });
        return r.items.map((l) => ({
          id: l.id,
          label: `SL${l.strata_lot_number}${l.unit_number ? ` (${l.unit_number})` : ""}`,
        }));
      }}
    />
  );
}

export function PartyPicker(props: Wrapped) {
  return (
    <EntityPicker
      {...props}
      queryKey="parties"
      placeholder={props.placeholder ?? "Search by name…"}
      search={async (q) => {
        const r = await partiesApi.list({ limit: 20, search: q || undefined });
        return r.items.map((p) => ({ id: p.id, label: p.full_name }));
      }}
    />
  );
}
