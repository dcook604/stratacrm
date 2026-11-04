import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { setBaseTitle } from "../../hooks/useDocumentTitle";
import Sidebar from "./Sidebar";
import { SidebarProvider, useSidebar } from "../../hooks/useSidebar";
import { Menu, X, Search } from "lucide-react";
import { GlobalSearchProvider, useGlobalSearch } from "../GlobalSearch";

function MobileHeader() {
  const { open, toggle } = useSidebar();
  const search = useGlobalSearch();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between bg-slate-900 text-white px-4 py-3 lg:hidden">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Strata Plan</p>
        <h1 className="text-white font-bold text-base leading-tight">BCS2611</h1>
      </div>
      <button
        onClick={search.open}
        className="ml-auto mr-1 p-2 rounded-md hover:bg-slate-800 transition-colors"
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </button>
      <button
        onClick={toggle}
        className="p-2 rounded-md hover:bg-slate-800 transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </header>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  lots: "Lots",
  parties: "Parties",
  bylaws: "Bylaws",
  infractions: "Infractions",
  incidents: "Incidents",
  issues: "Issues",
  payments: "Payments",
  reports: "Reports",
  communications: "Communications",
  users: "Users",
  "audit-log": "Audit Log",
  settings: "Email Ingest",
};

function LayoutInner() {
  const { pathname } = useLocation();
  useEffect(() => {
    const seg = pathname.split("/")[1] ?? "";
    const base = ROUTE_TITLES[seg] ?? "";
    const detail = pathname.split("/").length > 2 && seg !== "settings";
    setBaseTitle(base ? (detail ? `${base.replace(/s$/, "")} detail` : base) : "");
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[130] focus:bg-white focus:text-slate-900 focus:px-3 focus:py-2 focus:rounded-md focus:shadow"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <GlobalSearchProvider>
        <LayoutInner />
      </GlobalSearchProvider>
    </SidebarProvider>
  );
}
