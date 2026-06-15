import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import { useAuth } from "../../context/AuthContext";
import { BarChart3, RefreshCw } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BookkeeperAnalyticsPanel() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      setData(await apiFetch(`/bookkeeper/analytics?${params.toString()}`, { token }));
    } catch {/* ignore */} finally { setBusy(false); }
  }, [from, to, token]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["payments", "water-bills", "loans", "treasury"], load);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <BarChart3 size={20} className="text-blue-600" /> Analytics
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Totals across cashier transactions and aggregate CBU outstanding.</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {!data ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total Water Receipts" value={data.water.count} sub={`${peso(data.water.amountReceived)} received`} tone="emerald" />
            <Stat label="Total Loan Receipts" value={data.loan.count} sub={`${peso(data.loan.amountReceived)} received`} tone="blue" />
            <Stat label="Grand Receipts (count)" value={data.grand.count} sub={`${peso(data.grand.amountReceived)} received`} tone="indigo" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Water Due Collected" value={peso(data.water.amountDue)} sub={`+ excess ${peso(data.water.cbu)} → CBU`} tone="emerald" />
            <Stat label="Loan Due Collected" value={peso(data.loan.amountDue)} sub={`+ excess ${peso(data.loan.cbu)} → CBU`} tone="blue" />
            <Stat label="Grand Total Collected" value={peso(data.grand.amountReceived)} sub={`= ${peso(data.grand.amountDue)} due + ${peso(data.grand.cbu)} CBU`} tone="indigo" big />
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs uppercase tracking-wide text-blue-700">CBU outstanding (all members combined)</div>
            <div className="mt-1 text-3xl font-extrabold text-blue-800">{peso(data.cbuOutstanding)}</div>
            <div className="mt-0.5 text-[11px] text-blue-700">Money the cooperative owes its members as Capital Build-Up — settled when a product loan is released against it.</div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, tone = "slate", big }) {
  const bg = { slate: "bg-slate-50 border-slate-200 text-slate-800", emerald: "bg-emerald-50 border-emerald-200 text-emerald-800", blue: "bg-blue-50 border-blue-200 text-blue-800", indigo: "bg-indigo-50 border-indigo-200 text-indigo-800" }[tone] || "bg-slate-50";
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className={`mt-1 font-extrabold ${big ? "text-3xl" : "text-2xl"}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] opacity-80">{sub}</div>}
    </div>
  );
}
