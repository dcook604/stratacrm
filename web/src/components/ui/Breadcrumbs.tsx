import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  to?: string;
}

/** Shows where you are ("Lots › SL214"). Earlier crumbs link to their list. */
export default function Breadcrumbs({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-sm text-slate-500 flex-wrap ${className}`}>
      {items.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-500" aria-hidden />}
          {c.to && i < items.length - 1 ? (
            <Link to={c.to} className="hover:text-slate-800 hover:underline">{c.label}</Link>
          ) : (
            <span aria-current={i === items.length - 1 ? "page" : undefined} className={i === items.length - 1 ? "text-slate-800 font-medium" : ""}>
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
