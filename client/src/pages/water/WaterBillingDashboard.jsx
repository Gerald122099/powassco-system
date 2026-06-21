import { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../context/AuthContext";
import { waterBadges } from "../../lib/requestBadges";
import MembersPanel from "./panels/MembersPanel";
import BillsPanel from "./panels/BillsPanel";
import PaymentsPanel from "./panels/PaymentsPanel";
import AnalyticsPanel from "./panels/AnalyticsPanel";
import MeterMapPanel from "./panels/MeterMapPanel";
import BatchManagementPanel from "../meter/panels/BatchManagementPanel";
import MeterReadingsPanel from "../meter/panels/MeterReadingsPanel";
import PurokManagementPanel from "../meter/panels/PurokManagementPanel";
import OnlinePaymentsPanel from "../../components/OnlinePaymentsPanel";
import DisconnectionsPanel from "../../components/DisconnectionsPanel";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import ProductLoansPanel from "../bookkeeper/ProductLoansPanel";
import ProductAnalyticsPanel from "../../components/ProductAnalyticsPanel";
import ProductReservationsPanel from "../../components/ProductReservationsPanel";
import { Users, ReceiptText, CreditCard, BarChart3, Smartphone, AlertTriangle, Wallet, Boxes, ClipboardList, MapPin, Package } from "lucide-react";

const items = [
  { key: "members", label: "Members", icon: Users, desc: "Manage water members and meters" },
  { key: "readings", label: "Readings", icon: ClipboardList, desc: "Per-period reads — previous, present, read/unread totals" },
  { key: "metermap", label: "Meter Map", icon: MapPin, desc: "Map of every meter pinned by field plumbers — colour-coded by status" },
  { key: "puroks", label: "Puroks", icon: MapPin, desc: "Set purok names + groups • assign members • find unassigned" },
  { key: "bills", label: "Bills", icon: ReceiptText, desc: "Generate and manage water bills" },
  { key: "payments", label: "Payments", icon: CreditCard, desc: "Record and track payments" },
  { key: "batches", label: "Batch Assignment", icon: Boxes, desc: "Assign meters to plumbers / field readers • delete with password + 2FA" },
  { key: "products", label: "Product Loans", icon: Package, desc: "Catalogue of products (meter, rice, …) + applications, sale vs loan" },
  { key: "product-analytics", label: "Product Analytics", icon: BarChart3, desc: "Capital + profit per product, sale vs loan, paid/unpaid" },
  { key: "store-orders", label: "Store Reservations", icon: Package, desc: "Approve public-store reservations (verify by phone) + mark pickup" },
  { key: "collections", label: "Today's Collection", icon: Wallet, desc: "Daily water collection — cash, online, total" },
  { key: "disconnections", label: "Disconnections", icon: AlertTriangle, desc: "Accounts pending disconnection" },
  { key: "analytics", label: "Analytics", icon: BarChart3, desc: "Billing analytics and summaries" },
];

export default function WaterBillingDashboard() {
  const { token } = useAuth();
  const [tab, setTab] = useState("members");
  const [badges, setBadges] = useState({});
  useEffect(() => {
    const tick = () => waterBadges(token).then(setBadges).catch(() => {});
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [token]);
  const badged = items.map((it) => ({ ...it, badge: badges[it.key] || 0 }));
  return (
    <DashboardLayout title="Water Billing" accent="emerald" items={badged} active={tab} onSelect={setTab}>
      {tab === "members" && <MembersPanel />}
      {tab === "readings" && <MeterReadingsPanel />}
      {tab === "metermap" && <MeterMapPanel />}
      {tab === "puroks" && <PurokManagementPanel />}
      {tab === "bills" && <BillsPanel />}
      {tab === "payments" && <PaymentsPanel />}
      {tab === "batches" && <BatchManagementPanel />}
      {tab === "products" && <ProductLoansPanel />}
      {tab === "product-analytics" && <ProductAnalyticsPanel />}
      {tab === "store-orders" && <ProductReservationsPanel />}
      {tab === "collections" && <CollectionTodayPanel module="water" defaultMine />}
      {tab === "disconnections" && <DisconnectionsPanel />}
      {tab === "analytics" && <AnalyticsPanel />}
    </DashboardLayout>
  );
}
