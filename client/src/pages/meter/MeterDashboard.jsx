import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import logo from "../../assets/logo.png";
import MeterReadingsPanel from "./panels/MeterReadingsPanel";
import MeterAnalyticsPanel from "./panels/MeterAnalyticsPanel";
import { ClipboardList, BarChart3, LogOut } from "lucide-react";

const tabs = [
  { key: "readings", label: "Readings", icon: ClipboardList, desc: "Encode readings • Print receipt • Track read/unread" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Read/unread, member status, and bills summary" },
];

export default function MeterDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("readings");
  const active = tabs.find((t) => t.key === tab);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-slate-200 bg-white md:w-64">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-4 md:px-5">
          <img src={logo} alt="POWASSCO" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-sm font-bold text-slate-900">POWASSCO</div>
            <div className="truncate text-[11px] text-slate-500">Meter Reader</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-2 md:p-3">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.label}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                  isActive ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={2.2} className="shrink-0" />
                <span className="hidden md:inline">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="border-t border-slate-100 p-2 md:p-3">
          <div className="mb-2 hidden items-center gap-3 px-2 md:flex">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold uppercase text-purple-700">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{user?.fullName}</div>
              <div className="truncate text-[11px] text-slate-500">
                {user?.employeeId} • {user?.role}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 md:justify-start"
          >
            <LogOut size={16} className="shrink-0" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{active?.label}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{active?.desc}</p>
        </header>

        {/* Content */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {tab === "readings" && <MeterReadingsPanel />}
          {tab === "analytics" && <MeterAnalyticsPanel />}
        </main>
      </div>
    </div>
  );
}
