import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/** Debounced search box. `value` is the committed value (normally from the URL). */
export default function SearchInput({ value, onChange, placeholder = "Search…", className = "", autoFocus }: Props) {
  const [text, setText] = useState(value);
  const committed = useRef(value);

  function commit(v: string) {
    committed.current = v;
    onChange(v);
  }

  // Follow external changes (Back button, "Clear all") but never echo our own commits back,
  // which could clobber characters typed while the URL was updating.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return;
    const t = setTimeout(() => commit(text), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text !== committed.current) commit(text);
        }}
        className="input pl-9 pr-8"
        aria-label={placeholder}
      />
      {text && (
        <button
          type="button"
          onClick={() => { setText(""); commit(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
