import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface ButtonProps {
  label: string;
  sortKey: string;
  /** Current sort, formatted "key:asc" or "key:desc" */
  sort: string;
  onSort: (next: string) => void;
  /** Direction applied the first time the column is clicked */
  firstDir?: "asc" | "desc";
}

export function SortButton({ label, sortKey, sort, onSort, firstDir = "asc" }: ButtonProps) {
  const [key, dir] = sort.split(":");
  const active = key === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  const other = firstDir === "asc" ? "desc" : "asc";
  const next = active ? `${sortKey}:${dir === firstDir ? other : firstDir}` : `${sortKey}:${firstDir}`;
  return (
    <button
      type="button"
      onClick={() => onSort(next)}
      className="inline-flex items-center gap-1 uppercase hover:text-slate-900"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className={`w-3.5 h-3.5 ${active ? "text-slate-900" : "text-slate-300"}`} />
    </button>
  );
}

export default function SortHeader({ className = "", ...props }: ButtonProps & { className?: string }) {
  const [key, dir] = props.sort.split(":");
  const active = key === props.sortKey;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider ${className}`}
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <SortButton {...props} />
    </th>
  );
}
