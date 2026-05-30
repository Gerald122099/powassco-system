// Plumber dashboard — Field Mode only. Plumbers (the field readers) sign in
// here and see exclusively the offline meter-reading workflow. Office work
// (encoding, analytics, batch admin) is hidden from this role.
import DashboardLayout from "../../components/DashboardLayout";
import FieldModePanel from "../meter/panels/FieldModePanel";
import { Smartphone } from "lucide-react";

const items = [
  { key: "field", label: "Field Mode", icon: Smartphone, desc: "Download my assigned meters • read offline • sync when online" },
];

export default function PlumberDashboard() {
  return (
    <DashboardLayout title="Field Plumber" accent="purple" items={items} active="field" onSelect={() => {}}>
      <FieldModePanel />
    </DashboardLayout>
  );
}
