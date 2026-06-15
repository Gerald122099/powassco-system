import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import CollectionTodayPanel from "../../../components/CollectionTodayPanel";
import { apiFetch } from "../../../lib/api";
import { useRealtime } from "../../../lib/realtime";
import { useAuth } from "../../../context/AuthContext";
import { RefreshCw, Banknote, TrendingUp, Wallet, AlertCircle, Receipt, PiggyBank } from "lucide-react";

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls =
  "mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

const TONES = {
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
  slate: "bg-slate-100 text-slate-700",
};

function Kpi({ icon, label, value, tone = "slate" }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-slate-900">{value}</div>
        <div className="truncate text-xs font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function LoanAnalyticsPanel() {
  const { token } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useRealtime(["loans", "payments"], () => load());
  async function load() {
    setErr("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const url = "/loan/summary" + (qs.toString() ? `?${qs}` : "");
      setData(await apiFetch(url, { token }));
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
    <div className="space-y-4">
      <CollectionTodayPanel module="loan" />
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Loan Analytics</div>
          <div className="mt-0.5 text-sm text-slate-500">Capital released, interest profit, collections, and outstanding.</div>
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
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Apply
          </button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

      {!data ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi icon={Banknote} tone="blue" label="Capital Released" value={peso(data.capitalReleased)} />
            <Kpi icon={TrendingUp} tone="emerald" label="Interest (Profit)" value={peso(data.expectedInterest)} />
            <Kpi icon={Receipt} tone="violet" label="Charges Collected" value={peso(data.totalCharges)} />
            <Kpi icon={Wallet} tone="emerald" label="Total Collected" value={peso(data.totalCollected)} />
            <Kpi icon={AlertCircle} tone="amber" label="Outstanding" value={peso(data.outstanding)} />
            <Kpi icon={PiggyBank} tone="slate" label="Total Receivable" value={peso(data.totalReceivable)} />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-800">Applications by Status ({data.totalApplications} total)</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {["pending", "approved", "released", "closed", "rejected"].map((k) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-xl font-bold text-slate-900">{data.byStatus?.[k] ?? 0}</div>
                  <div className="text-xs capitalize text-slate-500">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
