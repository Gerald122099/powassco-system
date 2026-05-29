import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import MeterReadingsPanel from "./panels/MeterReadingsPanel";
import MeterAnalyticsPanel from "./panels/MeterAnalyticsPanel";
import FieldModePanel from "./panels/FieldModePanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import { ClipboardList, BarChart3, Smartphone, AlertTriangle } from "lucide-react";

const items = [
  { key: "readings", label: "Readings", icon: ClipboardList, desc: "Encode readings • Print receipt • Track read/unread" },
  { key: "field", label: "Field Mode", icon: Smartphone, desc: "Offline reading • QR scan • auto-sync when online" },
  { key: "disconnections", label: "Disconnections", icon: AlertTriangle, desc: "Accounts pending disconnection (notice)" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Read/unread, member status, and bills summary" },
];

export default function MeterReadingDashboard() {
  const [tab, setTab] = useState("readings");
  return (
    <DashboardLayout title="Meter Reader" accent="purple" items={items} active={tab} onSelect={setTab}>
      {tab === "readings" && <MeterReadingsPanel />}
      {tab === "field" && <FieldModePanel />}
      {tab === "disconnections" && <DisconnectionsPanel />}
      {tab === "analytics" && <MeterAnalyticsPanel />}
    </DashboardLayout>
  );
}
