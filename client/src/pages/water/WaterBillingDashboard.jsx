import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import MembersPanel from "./panels/MembersPanel";
import BillsPanel from "./panels/BillsPanel";
import PaymentsPanel from "./panels/PaymentsPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import MeterMapPanel from "./panels/MeterMapPanel";
import BatchManagementPanel from "../meter/panels/BatchManagementPanel";
import MeterReadingsPanel from "../meter/panels/MeterReadingsPanel";
import OnlinePaymentsPanel from "../../components/OnlinePaymentsPanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import { Users, ReceiptText, CreditCard, BarChart3, Smartphone, AlertTriangle, Wallet, Boxes, ClipboardList, MapPin } from "lucide-react";

const items = [
  { key: "members", label: "Members", icon: Users, desc: "Manage water members and meters" },
  { key: "readings", label: "Readings", icon: ClipboardList, desc: "Per-period reads — previous, present, read/unread totals" },
  { key: "metermap", label: "Meter Map", icon: MapPin, desc: "Map of every meter pinned by field plumbers — colour-coded by status" },
  { key: "bills", label: "Bills", icon: ReceiptText, desc: "Generate and manage water bills" },
  { key: "payments", label: "Payments", icon: CreditCard, desc: "Record and track payments" },
  { key: "batches", label: "Batch Assignment", icon: Boxes, desc: "Assign meters to plumbers / field readers • delete with password + 2FA" },
  { key: "collections", label: "Today's Collection", icon: Wallet, desc: "Daily water collection — cash, online, total" },
  { key: "disconnections", label: "Disconnections", icon: AlertTriangle, desc: "Accounts pending disconnection" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Billing analytics and summaries" },
];

export default function WaterBillingDashboard() {
  const [tab, setTab] = useState("members");
  return (
    <DashboardLayout title="Water Billing" accent="emerald" items={items} active={tab} onSelect={setTab}>
      {tab === "members" && <MembersPanel />}
      {tab === "readings" && <MeterReadingsPanel />}
      {tab === "metermap" && <MeterMapPanel />}
      {tab === "bills" && <BillsPanel />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "batches" && <BatchManagementPanel />}
      {tab === "collections" && <CollectionTodayPanel module="water" defaultMine />}
      {tab === "disconnections" && <DisconnectionsPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </DashboardLayout>
  );
}
