import { useState } from "react";
import BrandHeader from "../../components/BrandHeader";
import MeterReadingsPanel from "./panels/MeterReadingsPanel";
import MeterAnalyticsPanel from "./panels/MeterAnalyticsPanel";
import { ClipboardList, BarChart3 } from "lucide-react";

const tabs = [
  { key: "readings", label: "Readings", icon: ClipboardList },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

export default function MeterDashboard() {
  const [tab, setTab] = useState("readings");

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="space-y-5">
        <BrandHeader
          title="Meter Reader Dashboard"
          subtitle="Encode readings • Print receipt • Track read/unread"
        />

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
