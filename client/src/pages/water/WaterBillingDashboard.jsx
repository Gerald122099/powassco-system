import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import MembersPanel from "./panels/MembersPanel";
import BillsPanel from "./panels/BillsPanel";
import PaymentsPanel from "./panels/PaymentsPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import BatchManagementPanel from "../meter/panels/BatchManagementPanel";
import OnlinePaymentsPanel from "../../components/OnlinePaymentsPanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import { Users, ReceiptText, CreditCard, BarChart3, Smartphone, AlertTriangle, Wallet, Boxes } from "lucide-react";

const items = [
  { key: "members", label: "Members", icon: Users, desc: "Manage water members and meters" },
  { key: "bills", label: "Bills", icon: ReceiptText, desc: "Generate and manage water bills" },
  { key: "payments", label: "Payments", icon: CreditCard, desc: "Record and track payments" },
  { key: "batches", label: "Batch Assignment", icon: Boxes, desc: "Assign meters to plumbers / field readers • delete with password + 2FA" },
  { key: "collections", label: "Today's Collection", icon: Wallet, desc: "Daily water collection — cash, online, total" },
  { key: "online", label: "Online Payments", icon: Smartphone, desc: "Verify QR PH online payments" },
  { key: "disconnections", label: "Disconnections", icon: AlertTriangle, desc: "Accounts pending disconnection" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Billing analytics and summaries" },
];

export default function WaterBillingDashboard() {
  const [tab, setTab] = useState("members");
  return (
    <DashboardLayout title="Water Billing" accent="emerald" items={items} active={tab} onSelect={setTab}>
      {tab === "members" && <MembersPanel />}
      {tab === "bills" && <BillsPanel />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "batches" && <BatchManagementPanel />}
      {tab === "collections" && <CollectionTodayPanel module="water" defaultMine />}
      {tab === "online" && <OnlinePaymentsPanel module="water" />}
      {tab === "disconnections" && <DisconnectionsPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </DashboardLayout>
  );
}
