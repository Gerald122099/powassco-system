// Cashier dashboard — one-screen layout.
//
// Replaces the previous sidebar (Water / Loan / Collections separate tabs)
// with a single page that ALWAYS shows:
//   • Combined "Today" totals at the top — water + loan + product side by
//     side AND a grand total — so the cashier never has to switch tabs to
//     see what's been collected
//   • A pill switcher to flip between the Water dues lookup, the Loan
//     dues lookup, and Today's Collection audit view
//
// The dashboard fetches /collections/today once and passes the shared
// snapshot down to each panel so we don't double-load on tab switches.
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import WaterDuesLookup from "./WaterDuesLookup";
import LoanDuesLookup from "./LoanDuesLookup";
import CollectionTodayPanel from "../../components/CollectionTodayPanel";
import TransactionsPanel from "../bookkeeper/TransactionsPanel";
import CashierSalesPanel from "./CashierSalesPanel";
import CashierDisbursementsPanel from "./CashierDisbursementsPanel";
import CashierSavingsPanel from "./CashierSavingsPanel";
import ReportsPanel from "../../components/ReportsPanel";
import TreasuryPanel from "../../components/TreasuryPanel";
import CashDrawerPanel from "../../components/CashDrawerPanel";
import PettyCashPanel from "./PettyCashPanel";
import PrinterSettings from "../../components/PrinterSettings";
import ProductReservationsPanel from "../../components/ProductReservationsPanel";
import OnlinePaymentsPanel from "../../components/OnlinePaymentsPanel";
import { apiFetch } from "../../lib/api";
import { cashierBadges } from "../../lib/requestBadges";
import { useAuth } from "../../context/AuthContext";
import { Droplets, Banknote, ReceiptText, Wallet, CheckCircle, TrendingUp, History, ShoppingBag, FileDown, Receipt, PiggyBank, Coins, Printer, Smartphone } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Top-level nav remains the same SIDEBAR items list so role-based
// routing keeps working, but day-to-day the cashier only sees the
// "Counter" page (water + loan + collections unified). Other roles
// landing here see the same single screen.
const items = [
  { key: "counter", label: "Counter", icon: Wallet, desc: "Water + Loan dues lookup + today's collection on one screen" },
];

function Kpi({ label, value, sub, icon: Icon, tone = "slate" }) {
  const styles = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
  }[tone] || "bg-slate-50 border-slate-200 text-slate-800";
  return (
    <div className={`rounded-2xl border p-3 ${styles}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className="mt-1 font-mono text-lg font-extrabold">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}

export default function CashierDashboard() {
  const { token, user } = useAuth();
  const [view, setView] = useState("water"); // "water" | "loan" | "collections"
  const [todayStats, setTodayStats] = useState(null);
  const [pillBadges, setPillBadges] = useState({});
  // Online/GCash queue is only shown when online payments are enabled.
  const [onlineStatus, setOnlineStatus] = useState({ enabled: false, pendingCount: 0 });
  useEffect(() => {
    let alive = true;
    const tick = () => apiFetch("/payments/online-status", { token }).then((d) => { if (alive) setOnlineStatus(d); }).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);
  useEffect(() => {
    const tick = () => cashierBadges(token).then(setPillBadges).catch(() => {});
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [token]);

  // Shared "today" snapshot. Re-fetches on view switch is unnecessary
  // because the page tabs are sibling components — but we DO refresh
  // every 2 minutes so the strip stays current as new payments land.
  useEffect(() => {
    let alive = true;
    const fetchStats = () => {
      apiFetch("/collections/today?module=all", { token })
        .then((d) => { if (alive) setTodayStats(d); })
        .catch(() => { /* silent — KPIs gracefully fall back to "—" */ });
    };
    fetchStats();
    const t = setInterval(fetchStats, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  const waterCash = todayStats?.totals?.water?.cash ?? 0;
  const loanCash = todayStats?.totals?.loan?.cash ?? 0;
  const waterBills = todayStats?.totals?.water?.billCollected ?? 0;
  const loanBills = todayStats?.totals?.loan?.billCollected ?? 0;
  const cbuToday = todayStats?.totals?.cbu ?? 0;
  const grandToday =
    (todayStats?.totals?.water?.cash || 0) +
    (todayStats?.totals?.water?.online || 0) +
    (todayStats?.totals?.loan?.cash || 0) +
    (todayStats?.totals?.loan?.online || 0);
  const cbuOnFile = todayStats?.cbuOnFile?.total ?? 0;
  const savingsIn = todayStats?.totals?.savings?.in ?? 0;
  const savingsOut = todayStats?.totals?.savings?.out ?? 0;
  const disbursedToday = todayStats?.totals?.disbursed?.total ?? 0;
  // Server-computed when available; falls back to local math against
  // an older API build.
  const drawerNet = todayStats?.totals?.drawerNet
    ?? (Number(todayStats?.totals?.cash || 0) + savingsIn - savingsOut - disbursedToday);

  return (
    <DashboardLayout title="Cashier" accent="emerald" items={items} active="counter" onSelect={() => { /* single screen */ }}>
      {/* Unified today-totals strip — water, loan, CBU, grand. Always
          visible regardless of which lookup panel is open below. */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Kpi
            label="Water — Bills today"
            value={peso(waterBills)}
            sub={`${todayStats?.totals?.water?.count ?? 0} receipt(s)`}
            icon={Droplets}
            tone="blue"
          />
          <Kpi
            label="Water — Cash"
            value={peso(waterCash)}
            icon={Wallet}
            tone="amber"
          />
          <Kpi
            label="Loan — Bills today"
            value={peso(loanBills)}
            sub={`${todayStats?.totals?.loan?.count ?? 0} receipt(s)`}
            icon={Banknote}
            tone="violet"
          />
          <Kpi
            label="Loan — Cash"
            value={peso(loanCash)}
            icon={Wallet}
            tone="amber"
          />
          <Kpi
            label="CBU today"
            value={peso(cbuToday)}
            sub={`on file ₱${Number(cbuOnFile).toLocaleString()}`}
            icon={CheckCircle}
            tone="emerald"
          />
          <Kpi
            label="Savings IN"
            value={peso(savingsIn)}
            sub={`${todayStats?.totals?.savings?.inCount ?? 0} deposit(s)`}
            icon={TrendingUp}
            tone="emerald"
          />
          <Kpi
            label="Cash OUT"
            value={peso(savingsOut + disbursedToday)}
            sub={`withdrawals ₱${Number(savingsOut).toLocaleString()} · disbursed ₱${Number(disbursedToday).toLocaleString()}`}
            icon={Wallet}
            tone="amber"
          />
          <Kpi
            label="NET DRAWER"
            value={peso(drawerNet)}
            sub={`collections ₱${Number(grandToday).toLocaleString()} gross`}
            icon={TrendingUp}
            tone="emerald"
          />
        </div>

        {/* Pill switcher to choose which dues to look up. The
            counter never leaves this screen — every panel below
            renders inline. */}
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 text-sm font-semibold">
          {[
            { key: "water", label: "Water Dues", icon: Droplets },
            { key: "loan", label: "Loan Dues", icon: Banknote },
            { key: "sales", label: "Sales", icon: ShoppingBag },
            { key: "reservations", label: "Reservations", icon: ShoppingBag },
            { key: "savings", label: "Savings", icon: PiggyBank },
            // Shown only when online payments (GCash / PayMongo) are enabled.
            ...(onlineStatus.enabled ? [{ key: "online", label: "Online / GCash", icon: Smartphone, badge: onlineStatus.pendingCount }] : []),
            { key: "disbursements", label: "Disbursements", icon: Receipt },
            { key: "drawer", label: "Cash Drawer", icon: Wallet },
            { key: "pettycash", label: "Petty Cash", icon: Coins },
            { key: "collections", label: "Today's Collection", icon: ReceiptText },
            { key: "history", label: "Transaction History", icon: History },
            { key: "reports", label: "Reports", icon: FileDown },
            { key: "treasury", label: "Treasury", icon: Wallet },
            { key: "settings", label: "Printer", icon: Printer },
          ].map(({ key, label, icon, badge }) => {
            const Icon = icon;
            return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 transition ${
                view === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon size={14} /> {label}
              {(() => { const n = Number(badge ?? pillBadges[key]) || 0; return n > 0 ? (
                <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {n > 99 ? "99+" : n}
                </span>
              ) : null; })()}
            </button>
            );
          })}
        </div>

        {/* Selected panel. Each one still has its OWN module-specific
            KPI strip below the unified one above — that gives the
            cashier per-module reconciliation detail (drawer total,
            outstanding receivable) on top of the all-module summary. */}
        {view === "water" && <WaterDuesLookup />}
        {view === "loan" && <LoanDuesLookup />}
        {view === "sales" && <CashierSalesPanel />}
        {view === "online" && onlineStatus.enabled && <OnlinePaymentsPanel />}
        {view === "reservations" && <ProductReservationsPanel />}
        {view === "savings" && <CashierSavingsPanel />}
        {view === "disbursements" && <CashierDisbursementsPanel />}
        {view === "drawer" && <CashDrawerPanel />}
        {view === "pettycash" && <PettyCashPanel />}
        {view === "collections" && <CollectionTodayPanel module="all" />}
        {view === "history" && <TransactionsPanel />}
        {view === "reports" && <ReportsPanel />}
        {view === "treasury" && <TreasuryPanel />}
        {view === "settings" && <PrinterSettings cashierName={user?.fullName || user?.employeeId || ""} />}
      </div>
    </DashboardLayout>
  );
}
