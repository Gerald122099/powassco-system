import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import LoanApplyPanel from "./panels/LoanApplyPanel";
import LoansPanel from "./panels/LoansPanel";
import LoanAnalyticsPanel from "./panels/LoanAnalyticsPanel";
import LoanSettingsPanel from "./panels/LoanSettingsPanel";
import { FilePlus2, Landmark, BarChart3, Settings } from "lucide-react";

const items = [
  { key: "apply", label: "Apply", icon: FilePlus2, desc: "New loan application with water-bill eligibility check" },
  { key: "loans", label: "Loans", icon: Landmark, desc: "All loan applications and records" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Capital released, collections, and interest profit" },
  { key: "settings", label: "Settings", icon: Settings, desc: "Interest rate, default term, and charges" },
];

export default function LoanDashboard() {
  const [tab, setTab] = useState("apply");
  return (
    <DashboardLayout title="Loan System" accent="blue" items={items} active={tab} onSelect={setTab}>
      {tab === "apply" && <LoanApplyPanel />}
      {tab === "loans" && <LoansPanel />}
      {tab === "analytics" && <LoanAnalyticsPanel />}
      {tab === "settings" && <LoanSettingsPanel />}
    </DashboardLayout>
  );
}
