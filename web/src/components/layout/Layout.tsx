import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { SidebarProvider, useSidebar } from "../../hooks/useSidebar";
import { Menu, X } from "lucide-react";

function MobileHeader() {
  const { open, toggle } = useSidebar();
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between bg-slate-900 text-white px-4 py-3 lg:hidden">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Strata Plan</p>
        <h1 className="text-white font-bold text-base leading-tight">BCS2611</h1>
      </div>
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

function LayoutInner() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}
