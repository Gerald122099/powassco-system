// Cashier dashboard — read-only dues lookup.
// Flow: cashier types PN / meter / loan ID → sees outstanding dues → collects
// cash → writes a manual paper OR receipt → hands it to the consumer. The
// consumer then takes the paper OR to the Water Bill Officer (or Loan Officer)
// who actually marks the bill / loan as paid and stamps the OR number into
// the system through their existing officer panels.
import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import WaterDuesLookup from "./WaterDuesLookup";
import LoanDuesLookup from "./LoanDuesLookup";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import { Droplets, Banknote, ReceiptText } from "lucide-react";

const items = [
  { key: "water", label: "Water Dues", icon: Droplets, desc: "Lookup by Account No. or meter number — collect cash, give OR" },
  { key: "loan", label: "Loan Dues", icon: Banknote, desc: "Lookup by loan ID, reference, borrower name, or PN" },
  { key: "collections", label: "Today's Collection", icon: ReceiptText, desc: "Cash + online totals for any date — for daily audit" },
];

export default function CashierDashboard() {
  const [tab, setTab] = useState("water");
  return (
    <DashboardLayout title="Cashier" accent="emerald" items={items} active={tab} onSelect={setTab}>
      {tab === "water" && <WaterDuesLookup />}
      {tab === "loan" && <LoanDuesLookup />}
      {tab === "collections" && <CollectionTodayPanel module="all" />}
    </DashboardLayout>
  );
}
