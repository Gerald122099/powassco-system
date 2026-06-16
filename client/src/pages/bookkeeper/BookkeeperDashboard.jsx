import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { bookkeeperBadges } from "../../lib/requestBadges";
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
import CashDrawerPanel from "../../components/CashDrawerPanel";
import PettyCashPanel from "../cashier/PettyCashPanel";
import PayrollPanel from "../admin/PayrollPanel";
import { Receipt, Wallet, Package, BarChart3, Coins, FileDown, Scale, Landmark } from "lucide-react";

const items = [
  { key: "transactions", label: "Transactions", icon: Receipt, desc: "Every cashier payment — OR, name, meter, due, received, CBU excess" },
  { key: "members", label: "Members & CBU", icon: Wallet, desc: "Per-account CBU + every receivable in one row" },
  { key: "adjustments", label: "Adjustments", icon: Scale, desc: "Approve / reject admin-filed CBU + savings balance corrections" },
  { key: "treasury", label: "Treasury", icon: Landmark, desc: "Banks, Cash Vault, transfers — ordered approvals" },
  { key: "drawer", label: "Cash Drawer", icon: Wallet, desc: "Today's drawer inflow / outflow reconciliation" },
  { key: "pettycash", label: "Petty Cash", icon: Coins, desc: "Imprest fund balance + voucher ledger (view-only)" },
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
  const { token } = useAuth();
  const [badges, setBadges] = useState({});
  useEffect(() => {
    const tick = () => bookkeeperBadges(token).then(setBadges).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [token]);
  const badged = items.map((it) => ({ ...it, badge: badges[it.key] || 0 }));
  return (
    <DashboardLayout title="Bookkeeper" accent="blue" items={badged} active={tab} onSelect={setTab}>
      {tab === "transactions" && <TransactionsPanel />}
      {tab === "members" && <MembersCbuPanel />}
      {tab === "adjustments" && <AdjustmentsPanel />}
      {tab === "treasury" && <TreasuryPanel />}
      {tab === "drawer" && <CashDrawerPanel />}
      {tab === "pettycash" && <PettyCashPanel />}
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
