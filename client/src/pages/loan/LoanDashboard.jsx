import { useState } from "react";
import BrandHeader from "../../components/BrandHeader";

import LoansPanel from "./panels/LoansPanel";


const tabs = [
  { key: "apply", label: "Apply" },
  { key: "loans", label: "Loans" },

];

export default function LoanDashboard() {
  const [tab, setTab] = useState("apply");

  return (
    <div className="min-h-screen bg-slate-50 p-5">
      <BrandHeader title="Loan System" subtitle="Apply • Loans • Payments • Analytics" />

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
        {tab === "apply" && <ApplyLoanPanel />}
        {tab === "loans" && <LoansPanel />}
       
      </div>
    </div>
  );
}
