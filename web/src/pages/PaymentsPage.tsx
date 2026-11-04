import { useSearchParams } from "react-router-dom";
import { Settings, List, Receipt } from "lucide-react";
import { cn } from "../lib/utils";
import { PaymentsTab } from "./payments/PaymentsTab";
import { SchedulesTab } from "./payments/SchedulesTab";
import { ConfigTab } from "./payments/ConfigTab";

type Tab = "payments" | "schedules" | "config";

const TABS: Tab[] = ["payments", "schedules", "config"];

export default function PaymentsPage() {
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "payments";
  // Switching tabs drops the other tab's filters; push so Back returns to the previous tab.
  const setTab = (t: Tab) => setSp(t === "payments" ? {} : { tab: t });

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track locker rental payments and manage notification schedules
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: "payments" as Tab, label: "Payment Records", icon: Receipt },
          { id: "schedules" as Tab, label: "Schedules", icon: List },
          { id: "config" as Tab, label: "Settings", icon: Settings },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              tab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "payments" && <PaymentsTab />}
      {tab === "schedules" && <SchedulesTab />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}