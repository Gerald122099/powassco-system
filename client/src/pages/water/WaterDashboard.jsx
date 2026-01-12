import { useState } from "react";
import BrandHeader from "../../components/BrandHeader";
import MembersPanel from "./panels/MembersPanel";
import BillsPanel from "./panels/BillsPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import PaymentsPanel from "./panels/PaymentsPanel";

const tabs = [
  { key: "members", label: "Members" },
  { key: "bills", label: "Bills" },
  { key: "payments", label: "Payments" },
  { key: "analytics", label: "Analytics" },
];

export default function WaterDashboard() {
  const [tab, setTab] = useState("members");

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <BrandHeader title="Water Billing System" subtitle="Members • Bills • Payments • Analytics" />

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 rounded-2xl text-sm font-semibold border transition",
              tab === t.key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "members" && <MembersPanel />}
        {tab === "bills" && <BillsPanel />}
        {tab === "payments" && <PaymentsPanel />}
        {tab === "analytics" && <AnalyticsPanel />}
      </div>
    </div>
  );
}
