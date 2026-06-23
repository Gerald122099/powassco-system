// Members with a product-loan / rental balance past its due date — surfaced on
// the loan-officer dashboard + bookkeeper/manager records as a "pending
// disconnection / unsettled product loan" reminder. Hides itself when nothing
// is overdue so it never adds noise.
import { useEffect, useState } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { AlertTriangle, RefreshCw } from "lucide-react";

const peso = (n) => "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function OverdueProductLoansCard() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { setData(await apiFetch("/bookkeeper/product-loans/overdue", { token })); }
    catch { setData(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useRealtime(["payments"], load);

  if (!data || data.count === 0) return null; // nothing overdue → stay hidden

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <AlertTriangle size={18} className="text-red-600" /> Overdue Product Loans
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{data.count}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          Unsettled · <b className="text-red-600">{peso(data.total)}</b>
          <button onClick={load} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>
      <div className="mt-1 text-xs text-slate-500">Members with a product-loan balance past its due date — candidates for a settlement / disconnection notice.</div>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">Overdue</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p._id} className="border-t border-slate-100">
                <td className="px-3 py-2"><span className="font-mono">{p.pnNo}</span> <span className="text-slate-400">{p.accountName}</span></td>
                <td className="px-3 py-2">{p.productName} <span className="capitalize text-slate-400">· {p.transactionType}</span></td>
                <td className="px-3 py-2 text-slate-600">{fmt(p.dueDate)}</td>
                <td className="px-3 py-2 text-right"><span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{p.daysOverdue}d</span></td>
                <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{peso(p.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
