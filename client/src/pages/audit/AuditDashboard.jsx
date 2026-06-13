// Audit Committee dashboard — read-only oversight across every money
// flow and analytic in the system. The committee approves nothing and
// posts nothing; the panels reused here are either inherently
// read-only or naturally render no action controls for a role that
// isn't in their write/approve matrices (TreasuryPanel shows no
// file/approve buttons for audit_committee; AuditLogPanel is passed
// readOnly to hide the reset control).

import { useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import TransactionsPanel from "../bookkeeper/TransactionsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import AnalyticsPanel from "../water/panels/AnalyticsPanel";
import LoanAnalyticsPanel from "../loan/panels/LoanAnalyticsPanel";
import LoanCollectionsPanel from "../../components/LoanCollectionsPanel";
import ProductAnalyticsPanel from "../../components/ProductAnalyticsPanel";
import CashDrawerPanel from "../../components/CashDrawerPanel";
import TreasuryPanel from "../../components/TreasuryPanel";
import AuditLogPanel from "../admin/AuditLogPanel";
import {
  Receipt, ReceiptText, BarChart3, Banknote, Boxes, Wallet, Landmark, ScrollText, ShieldCheck,
} from "lucide-react";

const items = [
  { key: "transactions", label: "Transactions", icon: Receipt, desc: "Every cashier payment — water, loan, OR, name, CBU" },
  { key: "collections", label: "Overall Collections", icon: ReceiptText, desc: "Combined water + loan daily collection" },
  { key: "drawer", label: "Cash Drawer", icon: Wallet, desc: "Cashier drawer inflow / outflow reconciliation" },
  { key: "treasury", label: "Treasury", icon: Landmark, desc: "Banks + Cash Vault balances and movement ledger" },
  { key: "wateranalytics", label: "Water Analytics", icon: BarChart3, desc: "Water billing analytics and summaries" },
  { key: "loananalytics", label: "Loan Analytics", icon: Banknote, desc: "Capital, interest profit, collections, outstanding" },
  { key: "loancollections", label: "Loan Collections", icon: Banknote, desc: "Capital, interest, paid/unpaid by period" },
  { key: "products", label: "Product Analytics", icon: Boxes, desc: "Capital + profit per product, sale vs loan, paid/unpaid" },
  { key: "auditlog", label: "Audit Log", icon: ScrollText, desc: "Who did what, and when — across the whole system" },
];

export default function AuditDashboard() {
  const [tab, setTab] = useState("transactions");
  return (
    <DashboardLayout title="Audit Committee" accent="violet" items={items} active={tab} onSelect={setTab}>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
        <ShieldCheck size={14} /> Read-only oversight — the audit committee views everything but changes nothing.
      </div>
      {tab === "transactions" && <TransactionsPanel />}
      {tab === "collections" && <CollectionTodayPanel module="all" />}
      {tab === "drawer" && <CashDrawerPanel />}
      {tab === "treasury" && <TreasuryPanel />}
      {tab === "wateranalytics" && <AnalyticsPanel />}
      {tab === "loananalytics" && <LoanAnalyticsPanel />}
      {tab === "loancollections" && <LoanCollectionsPanel />}
      {tab === "products" && <ProductAnalyticsPanel />}
      {tab === "auditlog" && <AuditLogPanel readOnly />}
    </DashboardLayout>
  );
}
