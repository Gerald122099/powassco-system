// Payroll approvals (manager) — Phase 5. New payslips + cash advances
// are filed "pending"; the manager signs here, then the cashier pays
// out from their Disbursements tab (drawer-checked).

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { Coins, Check, X, RefreshCw, Plus } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function PayrollApprovalsPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [caOpen, setCaOpen] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [caForm, setCaForm] = useState({ employee: "", amount: "", notes: "" });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/payroll?status=pending&limit=50", { token });
      setItems(res.items || []);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["payroll"], load);

  async function act(p, approve) {
    const note = approve ? "" : prompt("Reason for rejecting:", "");
    if (!approve && note === null) return;
    try {
      await apiFetch(`/payroll/${p._id}/${approve ? "approve" : "reject"}`, { method: "POST", token, body: { note } });
      toast.success(approve ? "Approved — cashier can now disburse." : "Rejected.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function openCa() {
    try {
      const res = await apiFetch("/employees?limit=200", { token });
      setEmployees(res.items || res || []);
    } catch {/* ignore */}
    setCaForm({ employee: "", amount: "", notes: "" });
    setCaOpen(true);
  }
  async function fileCa() {
    if (!caForm.employee) return toast.error("Pick an employee.");
    if (!(Number(caForm.amount) > 0)) return toast.error("Amount must be > 0.");
    try {
      await apiFetch("/payroll/cash-advance", { method: "POST", token, body: { ...caForm, amount: Number(caForm.amount) } });
      toast.success("Cash advance filed — it appears in this queue for approval.");
      setCaOpen(false);
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Coins size={20} className="text-amber-600" /> Payroll Approvals
            {items.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{items.length} waiting</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Payslips and cash advances need your signature before the cashier can pay out.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCa} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50">
            <Plus size={13} /> File Cash Advance
          </button>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Deductions</th>
              <th className="px-3 py-2 text-right">Net pay</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-500">Nothing pending. 🎉</td></tr>
            ) : items.map((p) => (
              <tr key={p._id} className="border-t">
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.type === "cash_advance" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-800"}`}>
                    {p.type === "cash_advance" ? "CASH ADVANCE" : "PAYSLIP"}
                  </span>
                  {p.notes && <div className="mt-0.5 max-w-[10rem] truncate text-[10px] text-slate-500" title={p.notes}>{p.notes}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold">{p.employeeName}</div>
                  <div className="text-[10px] text-slate-500">{p.position}</div>
                </td>
                <td className="px-3 py-2 text-xs">{fmtD(p.periodStart)} – {fmtD(p.periodEnd)}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(p.grossPay)}</td>
                <td className="px-3 py-2 text-right font-mono text-rose-700">{peso(p.totalDeductions)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(p.netPay)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => act(p, true)} className="mr-1 rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Approve"><Check size={14} /></button>
                  <button onClick={() => act(p, false)} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Reject"><X size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={caOpen} title="File Cash Advance" onClose={() => setCaOpen(false)}>
        <div className="space-y-3">
          <select value={caForm.employee} onChange={(e) => setCaForm((f) => ({ ...f, employee: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">— pick an employee —</option>
            {employees.map((e) => <option key={e._id} value={e._id}>{e.fullName} {e.position ? `(${e.position})` : ""}</option>)}
          </select>
          <input type="number" min="0.01" step="0.01" value={caForm.amount} onChange={(e) => setCaForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Amount (₱)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" />
          <input value={caForm.notes} onChange={(e) => setCaForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Note (e.g. recover on June payroll)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The advance enters the approval queue, then the cashier pays it (drawer-checked). Recover it later as an "other deduction" on a future payslip.
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCaOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={fileCa} className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-700">File</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
