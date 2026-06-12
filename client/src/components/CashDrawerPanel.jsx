// Cash Drawer reconciliation — every inflow and outflow component for
// today, separated + totaled, with the drawer movement ledger under it.
// Shared by cashier (their drawer), bookkeeper, and manager (oversight).

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Wallet, RefreshCw, ArrowDownLeft, ArrowUpRight } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtT = (d) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function Row({ label, value, count, strong, negative }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2 ${strong ? "border-t-2 border-slate-300 bg-slate-50 font-bold" : "border-t border-slate-100"}`}>
      <span className={`text-sm ${strong ? "text-slate-900" : "text-slate-600"}`}>
        {label}{count !== undefined && <span className="ml-1 text-[10px] text-slate-400">({count})</span>}
      </span>
      <span className={`font-mono text-sm ${strong ? "text-base" : ""} ${negative ? "text-rose-700" : "text-slate-900"}`}>
        {negative ? "−" : ""}{peso(value)}
      </span>
    </div>
  );
}

export default function CashDrawerPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await apiFetch("/cashier/drawer-summary", { token })); }
    catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  const i = data?.inflows || {};
  const o = data?.outflows || {};
  const t = data?.totals || {};

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Wallet size={20} className="text-emerald-600" /> Cash Drawer — Today ({data?.date || "…"})
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Every peso in and out of the physical drawer, separated by source. Online payments shown apart — they never touch the drawer.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Headline tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700"><ArrowDownLeft size={12} /> Total IN</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-emerald-800">{peso(t.in)}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-rose-700"><ArrowUpRight size={12} /> Total OUT</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-rose-800">{peso(t.out)}</div>
        </div>
        <div className="rounded-2xl border-2 border-emerald-400 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">CASH IN DRAWER (net)</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-slate-900">{peso(t.net)}</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-blue-700">Online (not in drawer)</div>
          <div className="mt-1 font-mono text-xl font-extrabold text-blue-800">{peso(t.online)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inflows */}
        <div className="overflow-hidden rounded-2xl border border-emerald-200">
          <div className="bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
            Inflows — cash received
          </div>
          <Row label="Water bills" value={i.waterBill} count={i.waterCount} />
          <Row label="Water — CBU excess" value={i.waterCbu} />
          <Row label="Loan payments" value={i.loanBill} count={i.loanCount} />
          <Row label="Loan — CBU excess" value={i.loanCbu} />
          <Row label="Product sales + product-loan payments" value={i.product} count={i.productCount} />
          <Row label="Savings deposits" value={i.savingsIn} count={i.savingsInCount} />
          <Row label="Treasury / vault in (incl. member fees)" value={i.treasuryIn} />
          {Number(i.memberFees) > 0 && (
            <div className="px-4 pb-1 text-right text-[10px] text-slate-400">
              of which member fees: {peso(i.memberFees)} ({i.memberFeeCount})
            </div>
          )}
          <Row label="TOTAL IN" value={t.in} strong />
        </div>

        {/* Outflows */}
        <div className="overflow-hidden rounded-2xl border border-rose-200">
          <div className="bg-rose-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-rose-800">
            Outflows — cash handed out
          </div>
          <Row label="Savings withdrawals" value={o.savingsOut} count={o.savingsOutCount} negative />
          <Row label="Expense disbursements (cash)" value={o.expenseCash} count={o.expenseCashCount} negative />
          <Row label="Treasury out (loan + payroll payouts, drawer→vault)" value={o.treasuryOut} negative />
          <Row label="TOTAL OUT" value={t.out} strong negative />
          <div className="border-t-2 border-slate-300">
            <Row label="NET — CASH IN DRAWER" value={t.net} strong />
          </div>
        </div>
      </div>

      {/* Drawer movement ledger */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
          Drawer movements today (treasury ledger — payouts, vault moves, member fees)
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {!(data?.drawerLedger || []).length ? (
                <tr><td className="py-6 text-center text-slate-400">No drawer movements yet today.</td></tr>
              ) : data.drawerLedger.map((r) => (
                <tr key={r._id} className="border-t">
                  <td className="px-3 py-1.5 text-slate-500">{fmtT(r.createdAt)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {r.type === "in" ? "IN" : "OUT"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 max-w-[20rem] truncate" title={r.note}>{r.note}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-400">{r.refNo || "—"}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.by}</td>
                  <td className={`px-3 py-1.5 text-right font-mono font-bold ${r.type === "in" ? "text-emerald-700" : "text-rose-700"}`}>
                    {r.type === "in" ? "+" : "−"}{peso(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
