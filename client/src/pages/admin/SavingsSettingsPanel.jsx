// Admin: voluntary savings policy. Sets interest rate + frequency,
// minimum balance, and opening fee for all savings accounts.

import { useEffect, useState } from "react";
import Card from "../../components/Card";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { PiggyBank, Save, RefreshCw } from "lucide-react";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100";

export default function SavingsSettingsPanel() {
  const { token } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setS(await apiFetch("/savings/settings", { token }));
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function setField(k, v) { setS((p) => ({ ...p, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const body = {
        interestRatePerPeriod: Number(s.interestRatePerPeriod) || 0,
        interestFrequency: s.interestFrequency || "annually",
        minimumBalance: Number(s.minimumBalance) || 0,
        openingFee: Number(s.openingFee) || 0,
      };
      const updated = await apiFetch("/savings/settings", { method: "PUT", token, body });
      setS(updated);
      toast.success("Savings settings saved.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card><div className="text-sm text-slate-500">Loading…</div></Card>;
  if (!s) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <PiggyBank size={20} className="text-pink-600" /> Savings Settings
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Cooperative-wide policy for voluntary savings accounts. Last updated by{" "}
            <b>{s.updatedBy || "—"}</b>{s.updatedAt ? ` on ${new Date(s.updatedAt).toLocaleString()}` : ""}.
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} /> Reload
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-600">Interest rate (% per period)</label>
          <input type="number" step="0.01" min="0" value={s.interestRatePerPeriod ?? 0} onChange={(e) => setField("interestRatePerPeriod", e.target.value)} className={`mt-1 ${inputCls}`} />
          <div className="mt-1 text-[10px] text-slate-500">Set 0 to disable interest accrual.</div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Interest frequency</label>
          <select value={s.interestFrequency || "annually"} onChange={(e) => setField("interestFrequency", e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="monthly">Monthly</option>
            <option value="annually">Annually</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Minimum balance to maintain (₱)</label>
          <input type="number" step="0.01" min="0" value={s.minimumBalance ?? 0} onChange={(e) => setField("minimumBalance", e.target.value)} className={`mt-1 ${inputCls}`} />
          <div className="mt-1 text-[10px] text-slate-500">
            Withdrawals cannot drop balance below this. The cashier can override only when closing the account.
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Opening fee (₱)</label>
          <input type="number" step="0.01" min="0" value={s.openingFee ?? 0} onChange={(e) => setField("openingFee", e.target.value)} className={`mt-1 ${inputCls}`} />
          <div className="mt-1 text-[10px] text-slate-500">Cashier collects this when opening a new savings account.</div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-pink-700 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </Card>
  );
}
