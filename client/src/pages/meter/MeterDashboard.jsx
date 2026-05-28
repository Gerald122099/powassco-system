import { useState, useEffect } from "react";
import BrandHeader from "../../components/BrandHeader";
import MeterReadingsPanel from "./panels/MeterReadingsPanel";
import MeterAnalyticsPanel from "./panels/MeterAnalyticsPanel";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  ClipboardList,
  BarChart3,
  Users,
  CheckCircle2,
  CircleDashed,
  ReceiptText,
} from "lucide-react";

const tabs = [
  { key: "readings", label: "Readings", icon: ClipboardList },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

const TONES = {
  slate: "bg-slate-100 text-slate-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

function KpiCard({ icon, label, value, tone = "slate" }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-500">{label}</div>
        <div className="text-xl font-bold leading-tight text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export default function MeterDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState("readings");
  const [kpi, setKpi] = useState(null);
  const period = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/water/analytics?periodKey=${period}`, { token })
      .then((d) => !cancelled && setKpi(d))
      .catch(() => !cancelled && setKpi(null));
    return () => {
      cancelled = true;
    };
  }, [token, period]);

  const val = (v) => (kpi && v != null ? v : "—");

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="space-y-5">
        <BrandHeader
          title="Meter Reader Dashboard"
          subtitle="Encode readings • Print receipt • Track read/unread"
        />

        {/* KPI overview (current period) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard icon={Users} tone="slate" label="Total Members" value={val(kpi?.members)} />
          <KpiCard icon={CheckCircle2} tone="emerald" label="Read Meters" value={val(kpi?.readMeters)} />
          <KpiCard icon={CircleDashed} tone="amber" label="Unread Meters" value={val(kpi?.unreadMeters)} />
          <KpiCard icon={ReceiptText} tone="purple" label="Unpaid Bills" value={val(kpi?.unpaidBills)} />
        </div>

        {/* Segmented tab bar */}
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                <Icon size={16} strokeWidth={2.2} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div>
          {tab === "readings" && <MeterReadingsPanel />}
          {tab === "analytics" && <MeterAnalyticsPanel />}
        </div>
      </div>
    </div>
  );
}
