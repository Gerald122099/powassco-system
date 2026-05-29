import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { printFinancialReport } from "../../lib/reportPrint";
import { RefreshCw, Printer, Wallet, Banknote, TrendingUp, AlertCircle } from "lucide-react";

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const inputCls = "mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

function Kpi({ icon, label, value, tone = "slate" }) {
  const Icon = icon;
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={22} strokeWidth={2.2} /></div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-slate-900">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function ReportsPanel() {
  const { token, user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expenses, setExpenses] = useState(null);
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ from, to });
      const exp = await apiFetch(`/expenses/summary?${qs}`, { token });
      setExpenses(exp);
      // Loan summary is best-effort (date filter optional); don't fail the page if unavailable.
      try {
        setLoan(await apiFetch(`/loan/summary?${qs}`, { token }));
      } catch {
        setLoan(null);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Reports</div>
          <div className="mt-0.5 text-sm text-slate-500">Financial summary across expenses and the loan portfolio.</div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs font-semibold text-slate-600">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Apply
          </button>
          <button
            onClick={() => printFinancialReport({ from, to, expenses, loan, generatedBy: user?.fullName })}
            disabled={!expenses}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Printer size={16} /> Print Report
          </button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

      {!expenses ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Wallet} tone="amber" label={`Total Expenses · ${expenses.count} entries`} value={peso(expenses.total)} />
            <Kpi icon={Banknote} tone="blue" label="Capital Released" value={peso(loan?.capitalReleased)} />
            <Kpi icon={TrendingUp} tone="emerald" label="Loan Interest (Profit)" value={peso(loan?.expectedInterest)} />
            <Kpi icon={AlertCircle} tone="slate" label="Loan Outstanding" value={peso(loan?.outstanding)} />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">Expenses by Category</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5 text-right">Entries</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.byCategory.length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-slate-500">No expenses in this period.</td></tr>
                  ) : (
                    expenses.byCategory.map((c) => (
                      <tr key={c.category} className="border-t">
                        <td className="px-4 py-2.5">{c.category}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{c.count}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{peso(c.total)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="border-t bg-slate-50 font-bold">
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-right">{expenses.count}</td>
                    <td className="px-4 py-2.5 text-right">{peso(expenses.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
