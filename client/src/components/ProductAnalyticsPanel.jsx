// Product analytics — capital, profit, sale-vs-loan revenue split, and
// paid/unpaid per product + overall. Shared by manager + bookkeeper.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { Package, RefreshCw } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Tile({ label, value, tone }) {
  const cls = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone] || "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 font-mono text-lg font-extrabold">{value}</div>
    </div>
  );
}

export default function ProductAnalyticsPanel() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await apiFetch("/bookkeeper/product-analytics", { token })); }
    catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["loans", "payments"], load);

  const o = data?.overall || {};
  const inv = data?.inventory || {};
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Package size={20} className="text-orange-600" /> Product Analytics
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Capital vs profit per product, sale vs loan revenue, paid vs unpaid balances.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Sold / loaned out (capital of goods released)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Tile label="Transactions" value={o.count ?? "—"} />
        <Tile label="Capital of sold" value={peso(o.capital)} tone="blue" />
        <Tile label="Total profit" value={peso(o.profit)} tone="emerald" />
        <Tile label="Sold as SALE" value={peso(o.soldAsSale)} tone="amber" />
        <Tile label="Sold as LOAN" value={peso(o.soldAsLoan)} tone="violet" />
        <Tile label="Paid" value={peso(o.paid)} tone="emerald" />
        <Tile label="Unpaid" value={peso(o.unpaid)} tone="rose" />
      </div>

      {/* Inventory still on the shelf */}
      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Inventory on hand (not yet sold)</div>
      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Stock units remaining" value={inv.stockUnits ?? 0} />
        <Tile label="Capital tied in stock" value={peso(inv.capitalUnsold)} tone="blue" />
        <Tile label="Retail value unsold" value={peso(inv.retailUnsold)} tone="amber" />
        <Tile label="Potential profit if sold" value={peso(inv.profitPotential)} tone="emerald" />
      </div>

      {/* Per-item inventory */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">Stock inventory (per item)</div>
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2 text-right">Unit capital</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Capital in stock</th>
              <th className="px-3 py-2 text-right">Potential profit</th>
            </tr>
          </thead>
          <tbody>
            {!(inv.items || []).length ? (
              <tr><td colSpan={7} className="py-8 text-center text-xs text-slate-500">No catalogue items.</td></tr>
            ) : inv.items.map((it) => (
              <tr key={it.name} className={`border-t ${it.stock === 0 ? "text-slate-400" : ""}`}>
                <td className="px-3 py-2 font-semibold">{it.name}{!it.isActive && <span className="ml-1 text-[10px] text-slate-400">(inactive)</span>}</td>
                <td className="px-3 py-2 text-slate-500">{it.category}</td>
                <td className={`px-3 py-2 text-right font-mono font-bold ${it.stock === 0 ? "text-rose-500" : "text-slate-800"}`}>{it.stock}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(it.unitCapital)}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700">{peso(it.capitalUnsold)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-700">{peso(it.profitPotential)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Txns</th>
              <th className="px-3 py-2 text-right">Capital</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Sale revenue</th>
              <th className="px-3 py-2 text-right">Loan revenue</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Unpaid</th>
            </tr>
          </thead>
          <tbody>
            {!(data?.products || []).length ? (
              <tr><td colSpan={8} className="py-10 text-center text-xs text-slate-500">No product transactions yet.</td></tr>
            ) : data.products.map((r) => (
              <tr key={r.product} className="border-t">
                <td className="px-3 py-2 font-semibold">{r.product}</td>
                <td className="px-3 py-2 text-right font-mono">{r.count}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-700">{peso(r.capital)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(r.profit)}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(r.soldAsSale)}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(r.soldAsLoan)}</td>
                <td className="px-3 py-2 text-right font-mono text-emerald-700">{peso(r.paid)}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-700">{peso(r.unpaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
