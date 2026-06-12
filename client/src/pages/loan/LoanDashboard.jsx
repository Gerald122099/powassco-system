import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import LoanApplyPanel from "./panels/LoanApplyPanel";
import LoansPanel from "./panels/LoansPanel";
import LoanAnalyticsPanel from "./panels/LoanAnalyticsPanel";
import LoanSettingsPanel from "./panels/LoanSettingsPanel";
import OnlinePaymentsPanel from "../../components/OnlinePaymentsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import LoanCollectionsPanel from "../../components/LoanCollectionsPanel";
// Reused from cashier — server already allows loan_officer on the
// savings open/read endpoints (Phase 1). Loan officer can open
// accounts at the counter and view balances; deposit/withdrawal
// remains cashier-only.
import CashierSavingsPanel from "../cashier/CashierSavingsPanel";
import { FilePlus2, Landmark, BarChart3, Settings, Smartphone, Wallet, PiggyBank } from "lucide-react";

const items = [
  { key: "apply", label: "Apply", icon: FilePlus2, desc: "New loan application with water-bill eligibility check" },
  { key: "loans", label: "Loans", icon: Landmark, desc: "All loan applications and records" },
  { key: "savings", label: "Savings", icon: PiggyBank, desc: "Open savings accounts for members + view balances" },
  { key: "collections", label: "Today's Collection", icon: Wallet, desc: "Daily loan collection — cash, online, total" },
  { key: "period", label: "Collections by Period", icon: BarChart3, desc: "Capital, interest, deductions, paid/unpaid — by day, week, month, year" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Capital released, collections, and interest profit" },
  { key: "settings", label: "Settings", icon: Settings, desc: "Interest rate, default term, and charges" },
];

export default function LoanDashboard() {
  const [tab, setTab] = useState("apply");
  return (
    <DashboardLayout title="Loan System" accent="blue" items={items} active={tab} onSelect={setTab}>
      {tab === "apply" && <LoanApplyPanel />}
      {tab === "loans" && <LoansPanel />}
      {tab === "savings" && <CashierSavingsPanel />}
      {tab === "collections" && <CollectionTodayPanel module="loan" defaultMine />}
      {tab === "period" && <LoanCollectionsPanel />}
      {tab === "analytics" && <LoanAnalyticsPanel />}
      {tab === "settings" && <LoanSettingsPanel />}
    </DashboardLayout>
  );
}
