import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import MembersPanel from "./panels/MembersPanel";
import BillsPanel from "./panels/BillsPanel";
import PaymentsPanel from "./panels/PaymentsPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import { Users, ReceiptText, CreditCard, BarChart3 } from "lucide-react";

const items = [
  { key: "members", label: "Members", icon: Users, desc: "Manage water members and meters" },
  { key: "bills", label: "Bills", icon: ReceiptText, desc: "Generate and manage water bills" },
  { key: "payments", label: "Payments", icon: CreditCard, desc: "Record and track payments" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Billing analytics and summaries" },
];

export default function WaterBillingDashboard() {
  const [tab, setTab] = useState("members");
  return (
    <DashboardLayout title="Water Billing" accent="emerald" items={items} active={tab} onSelect={setTab}>
      {tab === "members" && <MembersPanel />}
      {tab === "bills" && <BillsPanel />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </DashboardLayout>
  );
}
