import { useEffect, useState } from "react";
import Card from "../../../components/Card";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

function Labeled({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export default function LoanSettingsPanel() {
  const { token } = useAuth();
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      setS(await apiFetch("/loan/settings", { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  function setField(k, v) {
    setS((p) => ({ ...p, [k]: v }));
  }
  function setCharge(i, k, v) {
    setS((p) => ({ ...p, charges: p.charges.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)) }));
  }
  function addCharge() {
    setS((p) => ({
      ...p,
      charges: [...(p.charges || []), { key: `charge${(p.charges?.length || 0) + 1}`, label: "New charge", type: "flat", value: 0 }],
    }));
  }
  function removeCharge(i) {
    setS((p) => ({ ...p, charges: p.charges.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    setErr("");
    setMsg("");
    setSaving(true);
    try {
      const body = {
        interestRatePerMonth: Number(s.interestRatePerMonth) || 0,
        defaultTermMonths: Number(s.defaultTermMonths) || 1,
        penaltyRatePerMonth: Number(s.penaltyRatePerMonth) || 0,
        charges: (s.charges || []).map((c) => ({
          key: c.key,
          label: c.label,
          type: c.type,
          value: Number(c.value) || 0,
        })),
      };
      const updated = await apiFetch("/loan/settings", { method: "PUT", token, body });
      setS(updated);
      setMsg("Settings saved.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card><div className="text-sm text-slate-500">Loading settings…</div></Card>;
  if (!s) return <Card><div className="text-sm text-red-600">{err || "Failed to load settings."}</div></Card>;

  const flatTotal = (s.charges || []).filter((c) => c.type === "flat").reduce((t, c) => t + (Number(c.value) || 0), 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Loan Settings</div>
          <div className="mt-0.5 text-sm text-slate-500">Interest rate, default term, and add-on charges.</div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Reload
        </button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {msg && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</div>}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Labeled label="Interest Rate (% / month)">
          <input type="number" step="0.01" value={s.interestRatePerMonth ?? ""} onChange={(e) => setField("interestRatePerMonth", e.target.value)} className={`mt-1 ${inputCls}`} />
        </Labeled>
        <Labeled label="Default Term (months)">
          <input type="number" min="1" value={s.defaultTermMonths ?? ""} onChange={(e) => setField("defaultTermMonths", e.target.value)} className={`mt-1 ${inputCls}`} />
        </Labeled>
        <Labeled label="Penalty Rate (% / month)">
          <input type="number" step="0.01" value={s.penaltyRatePerMonth ?? ""} onChange={(e) => setField("penaltyRatePerMonth", e.target.value)} className={`mt-1 ${inputCls}`} />
        </Labeled>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">Charges (deducted from principal → net proceeds)</div>
          <button onClick={addCharge} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
            <Plus size={14} /> Add charge
          </button>
        </div>
        <div className="space-y-2">
          {(s.charges || []).map((c, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <input value={c.label} onChange={(e) => setCharge(i, "label", e.target.value)} className={`col-span-6 ${inputCls}`} placeholder="Label" />
              <select value={c.type} onChange={(e) => setCharge(i, "type", e.target.value)} className={`col-span-3 ${inputCls}`}>
                <option value="flat">Flat (₱)</option>
                <option value="percent">Percent (%)</option>
              </select>
              <input type="number" step="0.01" value={c.value} onChange={(e) => setCharge(i, "value", e.target.value)} className={`col-span-2 ${inputCls}`} />
              <button onClick={() => removeCharge(i)} className="col-span-1 inline-flex items-center justify-center rounded-lg border border-red-200 py-2 text-red-600 hover:bg-red-50" title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Flat charges total ₱{flatTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} (percent charges scale with the loan amount).
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          <Save size={16} /> {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </Card>
  );
}
