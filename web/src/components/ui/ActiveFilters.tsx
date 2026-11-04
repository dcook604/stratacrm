import { X } from "lucide-react";

export interface FilterChip {
  label: string;
  onRemove: () => void;
}

export default function ActiveFilters({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Filters:</span>
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 hover:bg-blue-100"
          title="Remove filter"
        >
          {c.label}
          <X className="w-3 h-3" />
        </button>
      ))}
      <button type="button" onClick={onClearAll} className="text-slate-500 hover:text-slate-800 underline">
        Clear all
      </button>
    </div>
  );
}
