import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Returns to the previous page when the user arrived from inside the app (so the
 * list comes back with its search/filters/page intact); otherwise links to `fallback`.
 */
export default function BackLink({ fallback, label, className = "" }: { fallback: string; label: string; className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== "default";
  const cls = `inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 ${className}`;
  if (!canGoBack) {
    return (
      <Link to={fallback} className={cls}>
        <ArrowLeft className="w-4 h-4" /> {label}
      </Link>
    );
  }
  return (
    <Link
      to={fallback}
      className={cls}
      onClick={(e) => {
        e.preventDefault();
        navigate(-1);
      }}
    >
      <ArrowLeft className="w-4 h-4" /> {label}
    </Link>
  );
}
