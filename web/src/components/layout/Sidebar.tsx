import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, BookOpen, AlertTriangle,
  Wrench, FileText, LogOut, Shield, X, Mail, BarChart3,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useMe, useLogout } from "../../hooks/useAuth";
import { useSidebar } from "../../hooks/useSidebar";

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  available?: boolean;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/lots", icon: Building2, label: "Lots" },
  { to: "/parties", icon: Users, label: "Parties" },
  { to: "/bylaws", icon: BookOpen, label: "Bylaws" },
  { to: "/infractions", icon: AlertTriangle, label: "Infractions" },
  { to: "/incidents", icon: FileText, label: "Incidents" },
  { to: "/issues", icon: Wrench, label: "Issues" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/users", icon: Shield, label: "Users", adminOnly: true },
  { to: "/settings/email-ingest", icon: Mail, label: "Email Ingest", adminOnly: true },
];

export default function Sidebar() {
  const { data: meData } = useMe();
  const user = meData?.user;
  const logout = useLogout();
  const navigate = useNavigate();
  const { open, setOpen } = useSidebar();

  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // onError already cleared token and cache
    }
    setOpen(false);
    navigate("/login");
  }

  function handleNavClick() {
    setOpen(false);
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: overlay drawer on mobile, static sidebar on desktop */}
      <aside
        className={cn(
          "flex flex-col bg-slate-900 text-slate-100",
          /* Mobile: fixed overlay drawer with slide transition */
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
          /* Desktop: static sidebar in normal flow */
          "lg:static lg:translate-x-0 lg:z-auto lg:min-h-screen lg:w-64"
        )}
      >
        {/* Brand */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Strata Plan</p>
            <h1 className="text-white font-bold text-lg leading-tight">BCS2611</h1>
            <p className="text-slate-400 text-xs mt-0.5">Spectrum 4</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-slate-800 transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV
            .filter(({ adminOnly }) => !adminOnly || user?.role === "admin")
            .map(({ to, icon: Icon, label, available = true }) =>
            available ? (
              <NavLink
                key={to}
                to={to}
                onClick={handleNavClick}
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
    </>
  );
}
