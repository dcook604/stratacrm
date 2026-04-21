import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, BookOpen, AlertTriangle,
  Wrench, FileText, Upload, LogOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useMe, useLogout } from "../../hooks/useAuth";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  available?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/lots", icon: Building2, label: "Lots" },
  { to: "/parties", icon: Users, label: "Parties" },
  { to: "/import", icon: Upload, label: "Import" },
  { to: "/bylaws", icon: BookOpen, label: "Bylaws" },
  { to: "/infractions", icon: AlertTriangle, label: "Infractions" },
  { to: "/incidents", icon: FileText, label: "Incidents" },
  { to: "/issues", icon: Wrench, label: "Issues" },
];

export default function Sidebar() {
  const { data: meData } = useMe();
  const user = meData?.user;
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout.mutateAsync();
    navigate("/login");
  }

  return (
    <aside className="flex flex-col w-64 bg-slate-900 text-slate-100 min-h-screen">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Strata Plan</p>
        <h1 className="text-white font-bold text-lg leading-tight">BCS2611</h1>
        <p className="text-slate-400 text-xs mt-0.5">Spectrum 4</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, available = true }) =>
          available ? (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ) : (
            <div
              key={to}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 cursor-not-allowed select-none"
              title="Coming in a future session"
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              <span className="ml-auto text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Soon</span>
            </div>
          )
        )}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-slate-800">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user?.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 capitalize">{user?.role.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
