// Plumber dashboard — Field Mode + Disconnection / Reconnection field work.
// Plumbers go house-to-house; they need (a) the offline reading workflow and
// (b) a live queue of meters to physically disconnect or reconnect.
// Plumber dashboard — uses MobileShell (top bar + bottom tab bar) instead
// of DashboardLayout (sidebar). The field reader works exclusively on a
// phone, so a sidebar wastes the most valuable screen real estate.
import { useState } from "react";
import MobileShell from "../../components/MobileShell";
import AppPinLock from "../../components/AppPinLock";
import FieldModePanel from "../meter/panels/FieldModePanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import AppInstallPanel from "./AppInstallPanel";
import { Smartphone, AlertTriangle, Download } from "lucide-react";

const items = [
  { key: "field", label: "Field", icon: Smartphone },
  { key: "disconnect", label: "Disconnect", icon: AlertTriangle },
  { key: "app", label: "Get App", icon: Download },
];

const titleFor = (k) =>
  k === "field" ? "Field reader • offline-capable"
  : k === "disconnect" ? "Disconnections & reconnections"
  : "Install on this phone";

export default function PlumberDashboard() {
  const [tab, setTab] = useState("field");
  return (
    <AppPinLock>
      <MobileShell title={titleFor(tab)} items={items} active={tab} onSelect={setTab}>
        {tab === "field" && <FieldModePanel />}
        {tab === "disconnect" && <DisconnectionsPanel />}
        {tab === "app" && <AppInstallPanel />}
      </MobileShell>
    </AppPinLock>
  );
}
