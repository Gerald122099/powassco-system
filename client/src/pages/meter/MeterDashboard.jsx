import { useState } from "react";
import BrandHeader from "../../components/BrandHeader";
import MeterReadingsPanel from "./panels/MeterReadingsPanel";
import MeterAnalyticsPanel from "./panels/MeterAnalyticsPanel";

const tabs = [
  { key: "readings", label: "Readings" },
  { key: "analytics", label: "Analytics" },
];

export default function MeterDashboard() {
  const [tab, setTab] = useState("readings");

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <BrandHeader title="Meter Reader Dashboard" subtitle="Encode readings • Print receipt • Track read/unread" />

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 rounded-2xl text-sm font-semibold border transition",
              tab === t.key
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "readings" && <MeterReadingsPanel />}
        {tab === "analytics" && <MeterAnalyticsPanel />}
      </div>
    </div>
  );
}
