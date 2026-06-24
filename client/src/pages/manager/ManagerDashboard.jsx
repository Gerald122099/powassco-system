// Manager dashboard — operations management split out of admin
// (2026-06-13 restructure). Owns the day-to-day tabs that used to
// live on the admin sidebar: Expenses, Employees, Reports, Requests,
// Calendar & Events, Inventory. Also carries the shared monitoring
// views (Meter Map, Water Members, Water/Loan Analytics, Overall
// Collections, Announcements) that both admin and manager keep.
//
// Admin retains: user management, settings, audit, security,
// payments, adjustments, maintenance — pure system administration.

import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { managerBadges } from "../../lib/requestBadges";
import ExpensesPanel from "../admin/ExpensesPanel";
import EmployeesPanel from "../admin/EmployeesPanel";
import ReportsPanel from "../admin/ReportsPanel";
import RequestsPanel from "../admin/RequestsPanel";
import ProductReservationsPanel from "../../components/ProductReservationsPanel";
import EventsManagerPanel from "../../components/EventsManagerPanel";
import MeetingsPanel from "../admin/MeetingsPanel";
import AssetsPanel from "../admin/AssetsPanel";
import AnnouncementsPanel from "../admin/AnnouncementsPanel";
import MembersPanel from "../water/panels/MembersPanel";
import MeterMapPanel from "../water/panels/MeterMapPanel";
import AnalyticsPanel from "../water/panels/AnalyticsPanel";
import LoanAnalyticsPanel from "../loan/panels/LoanAnalyticsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import TreasuryPanel from "../../components/TreasuryPanel";
import LoanCollectionsPanel from "../../components/LoanCollectionsPanel";
import LoanApprovalsPanel from "../../components/LoanApprovalsPanel";
import PayrollApprovalsPanel from "../../components/PayrollApprovalsPanel";
import ProductLoansPanel from "../bookkeeper/ProductLoansPanel";
import ProductAnalyticsPanel from "../../components/ProductAnalyticsPanel";
import CashDrawerPanel from "../../components/CashDrawerPanel";
import PettyCashPanel from "../cashier/PettyCashPanel";
import AdjustmentsPanel from "../../components/AdjustmentsPanel";
import {
  Wallet, UserCog, FileBarChart, Inbox, CalendarClock, Boxes,
  MapPin, BarChart3, Banknote, ReceiptText, Megaphone, Landmark, Coins, Scale,
} from "lucide-react";

const items = [
  { key: "treasury", label: "Treasury", icon: Landmark, desc: "Approve bank + Cash Vault movements (you sign first)" },
  { key: "loan-approvals", label: "Loan Approvals", icon: Banknote, desc: "First signature on new loan applications" },
  { key: "payroll-approvals", label: "Payroll Approvals", icon: Wallet, desc: "Sign payslips + cash advances before the cashier pays" },
  { key: "adjustments", label: "Adjustments", icon: Scale, desc: "Approve CBU / savings balance adjustments filed by the bookkeeper" },
  { key: "products", label: "Products", icon: Boxes, desc: "Catalogue + stock + sales/loans/rentals (add products, adjust stocks directly)" },
  { key: "product-analytics", label: "Product Analytics", icon: Boxes, desc: "Capital + profit per product, sale vs loan, paid/unpaid" },
  { key: "store-orders", label: "Store Reservations", icon: Boxes, desc: "Approve public-store reservations (verify by phone) + mark pickup" },
  { key: "expenses", label: "Expenses", icon: Wallet, desc: "File disbursement requests — cashier pays them out" },
  { key: "employees", label: "Employees", icon: UserCog, desc: "Register staff, profiles, positions, and salary rates" },
  { key: "reports", label: "Reports", icon: FileBarChart, desc: "Financial reports across expenses and loans" },
  { key: "requests", label: "Requests", icon: Inbox, desc: "New connection, reconnection & concern/feedback messages from the public" },
  { key: "meetings", label: "Calendar & Events", icon: CalendarClock, desc: "Schedule meetings & events shown on staff dashboards" },
  { key: "events", label: "Public Events", icon: CalendarClock, desc: "Post public events/announcements with photos; see views & reactions" },
  { key: "assets", label: "Inventory", icon: Boxes, desc: "Equipment & device inventory with 6-month audits" },
  { key: "metermap", label: "Meter Map", icon: MapPin, desc: "Map of every meter pinned by field plumbers" },
  { key: "members", label: "Water Members", icon: UserCog, desc: "View and edit water member accounts" },
  { key: "analytics", label: "Water Analytics", icon: BarChart3, desc: "Water billing analytics and summaries" },
  { key: "loans", label: "Loan Analytics", icon: Banknote, desc: "Capital, interest profit, collections, outstanding" },
  { key: "loanperiod", label: "Loan Collections", icon: Banknote, desc: "Capital, interest, paid/unpaid by period" },
  { key: "collections", label: "Overall Collections", icon: ReceiptText, desc: "Combined water + loan daily collection" },
  { key: "drawer", label: "Cash Drawer", icon: Wallet, desc: "Cashier's drawer inflow / outflow reconciliation" },
  { key: "pettycash", label: "Petty Cash", icon: Coins, desc: "Imprest fund balance + voucher ledger (oversight)" },
  { key: "announcements", label: "Announcements", icon: Megaphone, desc: "Post announcements to the public homepage" },
];

export default function ManagerDashboard() {
  const [tab, setTab] = useState("treasury");
  const { token } = useAuth();
  const [badges, setBadges] = useState({});
  useEffect(() => {
    const tick = () => managerBadges(token).then(setBadges).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [token]);
  const badged = items.map((it) => ({ ...it, badge: badges[it.key] || 0 }));
  return (
    <DashboardLayout title="Manager" accent="indigo" items={badged} active={tab} onSelect={setTab}>
      {tab === "treasury" && <TreasuryPanel />}
      {tab === "loan-approvals" && <LoanApprovalsPanel />}
      {tab === "payroll-approvals" && <PayrollApprovalsPanel />}
      {tab === "adjustments" && <AdjustmentsPanel />}
      {tab === "products" && <ProductLoansPanel />}
      {tab === "product-analytics" && <ProductAnalyticsPanel />}
      {tab === "expenses" && <ExpensesPanel />}
      {tab === "employees" && <EmployeesPanel />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "requests" && <RequestsPanel />}
      {tab === "store-orders" && <ProductReservationsPanel />}
      {tab === "events" && <EventsManagerPanel />}
      {tab === "meetings" && <MeetingsPanel />}
      {tab === "assets" && <AssetsPanel />}
      {tab === "metermap" && <MeterMapPanel />}
      {tab === "members" && <MembersPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
      {tab === "loans" && <LoanAnalyticsPanel />}
      {tab === "loanperiod" && <LoanCollectionsPanel />}
      {tab === "collections" && <CollectionTodayPanel module="all" />}
      {tab === "drawer" && <CashDrawerPanel />}
      {tab === "pettycash" && <PettyCashPanel />}
      {tab === "announcements" && <AnnouncementsPanel />}
    </DashboardLayout>
  );
}
