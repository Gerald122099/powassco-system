import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { printPayslip } from "../../lib/payslipPrint";
import { Plus, Trash2, RefreshCw, Calculator, Save, Printer, Settings } from "lucide-react";

function peso(n) {
  return "₱ " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function d(x) {
  return x ? new Date(x).toLocaleDateString() : "—";
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

function L({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function Lines({ title, lines, setLines }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-600">{title}</div>
        <button onClick={() => setLines([...lines, { label: "", amount: "" }])} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold hover:bg-slate-50"><Plus size={12} /> Add</button>
      </div>
      <div className="space-y-1.5">
        {lines.length === 0 && <div className="text-xs text-slate-400">None</div>}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <input type="number" step="0.01" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="0.00" className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-lg border border-red-200 px-2 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PayrollPanel() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [slips, setSlips] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  // form
  const [empId, setEmpId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [daysWorked, setDaysWorked] = useState("");
  const [basicPay, setBasicPay] = useState("");
  const [overtimePay, setOvertimePay] = useState("");
  const [allowances, setAllowances] = useState([]);
  const [otherDeductions, setOtherDeductions] = useState([]);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  // settings
  const [setOpen, setSetOpen] = useState(false);
  const [settings, setSettings] = useState(null);

  const selectedEmp = useMemo(() => employees.find((e) => e._id === empId), [employees, empId]);

  useEffect(() => {
    apiFetch("/employees?status=active&limit=100", { token })
      .then((d2) => setEmployees(d2.items || []))
      .catch(() => {});
  }, [token]);

  async function loadSlips() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch("/payroll?limit=20", { token });
      setSlips(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadSlips(); /* eslint-disable-next-line */
  }, []);

  // auto-fill basic pay from rate
  useEffect(() => {
    if (!selectedEmp) return;
    if (selectedEmp.rateType === "monthly") setBasicPay(String(selectedEmp.rate || 0));
    else setBasicPay(String((Number(selectedEmp.rate) || 0) * (Number(daysWorked) || 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId, daysWorked]);

  function flash(m) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  function payloadBody() {
    return {
      employee: empId,
      periodStart,
      periodEnd,
      payDate,
      daysWorked: Number(daysWorked) || 0,
      basicPay: Number(basicPay) || 0,
      overtimePay: Number(overtimePay) || 0,
      allowances: allowances.map((a) => ({ label: a.label, amount: Number(a.amount) || 0 })),
      otherDeductions: otherDeductions.map((o) => ({ label: o.label, amount: Number(o.amount) || 0 })),
      notes,
    };
  }

  async function compute() {
    setErr("");
    try {
      setPreview(await apiFetch("/payroll/compute", { method: "POST", token, body: payloadBody() }));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function save() {
    if (!empId) return setErr("Select an employee.");
    if (!periodStart || !periodEnd) return setErr("Set the pay period.");
    setErr("");
    setSaving(true);
    try {
      const slip = await apiFetch("/payroll", { method: "POST", token, body: payloadBody() });
      flash("Payslip saved.");
      setPreview(null);
      setDaysWorked(""); setOvertimePay(""); setAllowances([]); setOtherDeductions([]); setNotes("");
      await loadSlips();
      printPayslip(slip);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeSlip(row) {
    if (!confirm(`Delete payslip for ${row.employeeName}?`)) return;
    try {
      await apiFetch(`/payroll/${row._id}`, { method: "DELETE", token });
      flash("Payslip deleted.");
      await loadSlips();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function openSettings() {
    setErr("");
    try {
      setSettings(await apiFetch("/payroll/settings", { token }));
      setSetOpen(true);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function saveSettings() {
    try {
      const updated = await apiFetch("/payroll/settings", { method: "PUT", token, body: settings });
      setSettings(updated);
      setSetOpen(false);
      flash("Statutory settings saved.");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Payroll</div>
          <div className="mt-0.5 text-sm text-slate-500">Create payslips with SSS, PhilHealth, Pag-IBIG, and withholding tax.</div>
        </div>
        <button onClick={openSettings} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Settings size={16} /> Statutory Settings</button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      {/* New payslip */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">New Payslip</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <L label="Employee">
              <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={`mt-1 ${inputCls}`}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e._id} value={e._id}>{e.fullName} {e.position ? `· ${e.position}` : ""}</option>)}
              </select>
            </L>
            <L label="Pay Date"><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <L label="Period Start"><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <L label="Period End"><input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <L label={selectedEmp?.rateType === "hourly" ? "Hours Worked" : "Days Worked"}><input type="number" step="0.01" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <L label="Basic Pay (₱)"><input type="number" step="0.01" value={basicPay} onChange={(e) => setBasicPay(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <L label="Overtime Pay (₱)"><input type="number" step="0.01" value={overtimePay} onChange={(e) => setOvertimePay(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            <div />
            <Lines title="Allowances" lines={allowances} setLines={setAllowances} />
            <Lines title="Other Deductions" lines={otherDeductions} setLines={setOtherDeductions} />
            <div className="sm:col-span-2">
              <L label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={`mt-1 ${inputCls}`} /></L>
            </div>
          </div>
          {selectedEmp && <div className="mt-2 text-xs text-slate-500">Rate: {peso(selectedEmp.rate)} / {selectedEmp.rateType}</div>}
          <div className="mt-4 flex gap-2">
            <button onClick={compute} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"><Calculator size={16} /> Compute</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><Save size={16} /> {saving ? "Saving…" : "Save & Print"}</button>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-800">Computation</div>
          {!preview ? (
            <div className="text-sm text-slate-400">Click Compute to preview deductions and net pay.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1 text-slate-500">Basic Pay</td><td className="py-1 text-right font-semibold">{peso(preview.basicPay)}</td></tr>
                <tr><td className="py-1 text-slate-500">Overtime</td><td className="py-1 text-right">{peso(preview.overtimePay)}</td></tr>
                <tr><td className="py-1 text-slate-500">Allowances</td><td className="py-1 text-right">{peso(preview.allowancesTotal)}</td></tr>
                <tr className="border-t"><td className="py-1 font-bold text-slate-800">Gross Pay</td><td className="py-1 text-right font-bold text-emerald-700">{peso(preview.grossPay)}</td></tr>
                <tr><td className="py-1 text-slate-500">SSS</td><td className="py-1 text-right">{peso(preview.sss)}</td></tr>
                <tr><td className="py-1 text-slate-500">PhilHealth</td><td className="py-1 text-right">{peso(preview.philhealth)}</td></tr>
                <tr><td className="py-1 text-slate-500">Pag-IBIG</td><td className="py-1 text-right">{peso(preview.pagibig)}</td></tr>
                <tr><td className="py-1 text-slate-500">Withholding Tax</td><td className="py-1 text-right">{peso(preview.withholdingTax)}</td></tr>
                <tr><td className="py-1 text-slate-500">Other Deductions</td><td className="py-1 text-right">{peso(preview.otherDeductionsTotal)}</td></tr>
                <tr className="border-t"><td className="py-1 font-bold text-slate-800">Total Deductions</td><td className="py-1 text-right font-bold text-red-600">{peso(preview.totalDeductions)}</td></tr>
                <tr className="border-t-2 border-emerald-600"><td className="py-2 text-base font-extrabold text-slate-900">NET PAY</td><td className="py-2 text-right text-base font-extrabold text-emerald-700">{peso(preview.netPay)}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payslip history */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">Recent Payslips ({total})</div>
        <button onClick={loadSlips} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Reload</button>
      </div>
      <div className="mt-3 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net Pay</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : slips.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">No payslips yet.</td></tr>
            ) : (
              slips.map((row) => (
                <tr key={row._id} className="border-t hover:bg-slate-50/60">
                  <td className="px-4 py-3"><div className="font-semibold text-slate-800">{row.employeeName}</div><div className="text-xs text-slate-500">{row.position}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{d(row.periodStart)} – {d(row.periodEnd)}</td>
                  <td className="px-4 py-3 text-right">{peso(row.grossPay)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{peso(row.totalDeductions)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">{peso(row.netPay)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => printPayslip(row)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Print payslip"><Printer size={14} /></button>
                    <button onClick={() => removeSlip(row)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Statutory settings */}
      <Modal open={setOpen} title="Statutory Settings" subtitle="Editable PH contribution rates and tax brackets" onClose={() => setSetOpen(false)} size="lg">
        {settings && <SettingsForm settings={settings} setSettings={setSettings} onSave={saveSettings} onCancel={() => setSetOpen(false)} />}
      </Modal>
    </Card>
  );
}

function pct(n) {
  return (Number(n) || 0) * 100;
}

function SettingsForm({ settings, setSettings, onSave, onCancel }) {
  function setG(group, key, val) {
    setSettings((s) => ({ ...s, [group]: { ...s[group], [key]: val } }));
  }
  function setBracket(i, key, val) {
    setSettings((s) => ({ ...s, withholding: s.withholding.map((b, j) => (j === i ? { ...b, [key]: Number(val) || 0 } : b)) }));
  }
  const inp = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-bold text-slate-800">SSS</div>
          <label className="text-xs text-slate-500">Employee Rate (%)</label>
          <input type="number" step="0.01" value={pct(settings.sss.employeeRate)} onChange={(e) => setG("sss", "employeeRate", (Number(e.target.value) || 0) / 100)} className={inp} />
          <label className="mt-2 block text-xs text-slate-500">Min Base</label>
          <input type="number" value={settings.sss.minBase} onChange={(e) => setG("sss", "minBase", Number(e.target.value) || 0)} className={inp} />
          <label className="mt-2 block text-xs text-slate-500">Max Base</label>
          <input type="number" value={settings.sss.maxBase} onChange={(e) => setG("sss", "maxBase", Number(e.target.value) || 0)} className={inp} />
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-bold text-slate-800">PhilHealth</div>
          <label className="text-xs text-slate-500">Employee Rate (%)</label>
          <input type="number" step="0.01" value={pct(settings.philhealth.employeeRate)} onChange={(e) => setG("philhealth", "employeeRate", (Number(e.target.value) || 0) / 100)} className={inp} />
          <label className="mt-2 block text-xs text-slate-500">Min Base</label>
          <input type="number" value={settings.philhealth.minBase} onChange={(e) => setG("philhealth", "minBase", Number(e.target.value) || 0)} className={inp} />
          <label className="mt-2 block text-xs text-slate-500">Max Base</label>
          <input type="number" value={settings.philhealth.maxBase} onChange={(e) => setG("philhealth", "maxBase", Number(e.target.value) || 0)} className={inp} />
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-bold text-slate-800">Pag-IBIG</div>
          <label className="text-xs text-slate-500">Employee Rate (%)</label>
          <input type="number" step="0.01" value={pct(settings.pagibig.employeeRate)} onChange={(e) => setG("pagibig", "employeeRate", (Number(e.target.value) || 0) / 100)} className={inp} />
          <label className="mt-2 block text-xs text-slate-500">Max Base</label>
          <input type="number" value={settings.pagibig.maxBase} onChange={(e) => setG("pagibig", "maxBase", Number(e.target.value) || 0)} className={inp} />
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-bold text-slate-800">Withholding Tax Brackets (monthly)</div>
        <div className="text-xs text-slate-500 mb-2">Tax = Base + Rate × (taxable income − Over).</div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-1">Over (₱)</th><th className="py-1">Base Tax (₱)</th><th className="py-1">Rate (%)</th></tr></thead>
          <tbody>
            {settings.withholding.map((b, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input type="number" value={b.over} onChange={(e) => setBracket(i, "over", e.target.value)} className={inp} /></td>
                <td className="py-1 pr-2"><input type="number" step="0.01" value={b.base} onChange={(e) => setBracket(i, "base", e.target.value)} className={inp} /></td>
                <td className="py-1"><input type="number" step="0.01" value={pct(b.rate)} onChange={(e) => setBracket(i, "rate", (Number(e.target.value) || 0) / 100)} className={inp} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
        <button onClick={onSave} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Save Settings</button>
      </div>
    </div>
  );
}
