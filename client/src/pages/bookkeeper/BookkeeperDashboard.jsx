import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import TransactionsPanel from "./TransactionsPanel";
import MembersCbuPanel from "./MembersCbuPanel";
import ProductLoansPanel from "./ProductLoansPanel";
import BookkeeperAnalyticsPanel from "./BookkeeperAnalyticsPanel";
import { Receipt, Wallet, Package, BarChart3 } from "lucide-react";

const items = [
  { key: "transactions", label: "Transactions", icon: Receipt, desc: "Every cashier payment — OR, name, meter, due, received, CBU excess" },
  { key: "members", label: "Members & CBU", icon: Wallet, desc: "CBU balance per account + per-account ledger" },
  { key: "products", label: "Product Loans", icon: Package, desc: "Catalogue of available products + applications (meter, rice, …)" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Totals per water / loan / combined" },
];

export default function BookkeeperDashboard() {
  const [tab, setTab] = useState("transactions");
  return (
    <DashboardLayout title="Bookkeeper" accent="blue" items={items} active={tab} onSelect={setTab}>
      {tab === "transactions" && <TransactionsPanel />}
      {tab === "members" && <MembersCbuPanel />}
      {tab === "products" && <ProductLoansPanel />}
      {tab === "analytics" && <BookkeeperAnalyticsPanel />}
    </DashboardLayout>
  );
}
