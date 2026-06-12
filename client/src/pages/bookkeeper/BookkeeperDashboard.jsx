import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import TransactionsPanel from "./TransactionsPanel";
import MembersCbuPanel from "./MembersCbuPanel";
import ProductLoansPanel from "./ProductLoansPanel";
import BookkeeperAnalyticsPanel from "./BookkeeperAnalyticsPanel";
import ReportsPanel from "../../components/ReportsPanel";
import AdjustmentsPanel from "../../components/AdjustmentsPanel";
import TreasuryPanel from "../../components/TreasuryPanel";
import LoanCollectionsPanel from "../../components/LoanCollectionsPanel";
import LoanApprovalsPanel from "../../components/LoanApprovalsPanel";
import ProductAnalyticsPanel from "../../components/ProductAnalyticsPanel";
import PayrollPanel from "../admin/PayrollPanel";
import { Receipt, Wallet, Package, BarChart3, Coins, FileDown, Scale, Landmark } from "lucide-react";

const items = [
  { key: "transactions", label: "Transactions", icon: Receipt, desc: "Every cashier payment — OR, name, meter, due, received, CBU excess" },
  { key: "members", label: "Members & CBU", icon: Wallet, desc: "Per-account CBU + every receivable in one row" },
  { key: "adjustments", label: "Adjustments", icon: Scale, desc: "Approve / reject admin-filed CBU + savings balance corrections" },
  { key: "treasury", label: "Treasury", icon: Landmark, desc: "Banks, Cash Vault, transfers — ordered approvals" },
  { key: "loan-approvals", label: "Loan Approvals", icon: Landmark, desc: "Second signature on loans the manager approved" },
  { key: "products", label: "Product Loans", icon: Package, desc: "Catalogue of available products + applications (meter, rice, …)" },
  { key: "product-analytics", label: "Product Analytics", icon: Package, desc: "Capital + profit per product, sale vs loan, paid/unpaid" },
  { key: "reports", label: "Reports", icon: FileDown, desc: "Treasurer's Report — PDF/Excel by day, week, month, or custom range" },
  { key: "payroll", label: "Payroll", icon: Coins, desc: "Payslips with SSS, PhilHealth, Pag-IBIG, and withholding tax" },
  { key: "loanperiod", label: "Loan Collections", icon: BarChart3, desc: "Loan capital, interest, paid/unpaid by period" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Totals per water / loan / combined" },
];

export default function BookkeeperDashboard() {
  const [tab, setTab] = useState("transactions");
  return (
    <DashboardLayout title="Bookkeeper" accent="blue" items={items} active={tab} onSelect={setTab}>
      {tab === "transactions" && <TransactionsPanel />}
      {tab === "members" && <MembersCbuPanel />}
      {tab === "adjustments" && <AdjustmentsPanel />}
      {tab === "treasury" && <TreasuryPanel />}
      {tab === "loan-approvals" && <LoanApprovalsPanel />}
      {tab === "products" && <ProductLoansPanel />}
      {tab === "product-analytics" && <ProductAnalyticsPanel />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "payroll" && <PayrollPanel />}
      {tab === "loanperiod" && <LoanCollectionsPanel />}
      {tab === "analytics" && <BookkeeperAnalyticsPanel />}
    </DashboardLayout>
  );
}
