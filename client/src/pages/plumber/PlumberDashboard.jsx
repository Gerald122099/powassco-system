// Plumber dashboard — Field Mode + Disconnection / Reconnection field work.
// Plumbers go house-to-house; they need (a) the offline reading workflow and
// (b) a live queue of meters to physically disconnect or reconnect.
import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import FieldModePanel from "../meter/panels/FieldModePanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import { Smartphone, AlertTriangle } from "lucide-react";

const items = [
  { key: "field", label: "Field Mode", icon: Smartphone, desc: "Download my assigned meters • read offline • sync when online" },
  { key: "disconnections", label: "Disconnections", icon: AlertTriangle, desc: "Meters to physically disconnect or reconnect" },
];

export default function PlumberDashboard() {
  const [tab, setTab] = useState("field");
  return (
    <DashboardLayout title="Field Plumber" accent="purple" items={items} active={tab} onSelect={setTab}>
      {tab === "field" && <FieldModePanel />}
      {tab === "disconnections" && <DisconnectionsPanel />}
    </DashboardLayout>
  );
}
