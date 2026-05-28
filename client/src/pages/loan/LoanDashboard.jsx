import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import LoansPanel from "./panels/LoansPanel";
import { Landmark } from "lucide-react";

const items = [
  { key: "loans", label: "Loans", icon: Landmark, desc: "Loan applications and records" },
];

export default function LoanDashboard() {
  const [tab, setTab] = useState("loans");
  return (
    <DashboardLayout title="Loan System" accent="blue" items={items} active={tab} onSelect={setTab}>
      {tab === "loans" && <LoansPanel />}
    </DashboardLayout>
  );
}
