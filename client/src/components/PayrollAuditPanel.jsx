// Read-only payroll viewer for the audit committee. Lists payslips +
// cash advances with their status and net pay; no create/approve/pay
// controls (the committee audits, it doesn't run payroll).

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Coins, RefreshCw } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const STATUS = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  disbursed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export default function PayrollAuditPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ limit: "100" });
      if (status) qs.set("status", status);
      const r = await apiFetch(`/payroll?${qs}`, { token });
      setItems(r.items || []);
    } catch {/* ignore */} finally { setBusy(false); }
  }, [token, status]);
  useEffect(() => { load(); }, [load]);

  const total = items.reduce((s, p) => s + (Number(p.netPay) || 0), 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Coins size={20} className="text-amber-600" /> Payroll (audit view)
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Read-only — every payslip + cash advance, with status and net pay.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 text-xs font-semibold">
            {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["disbursed", "Disbursed"], ["rejected", "Rejected"]].map(([k, label]) => (
              <button key={k || "all"} onClick={() => setStatus(k)} className={`rounded-lg px-3 py-1 ${status === k ? "bg-amber-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm text-slate-600">Showing <b>{items.length}</b> record(s) · net total <b className="font-mono">{peso(total)}</b></div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Approved / Disbursed by</th>
              <th className="px-3 py-2">OR</th>
              <th className="px-3 py-2 text-right">Net pay</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-500">No payroll records.</td></tr>
            ) : items.map((p) => (
              <tr key={p._id} className="border-t">
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.type === "cash_advance" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{p.type === "cash_advance" ? "ADVANCE" : "PAYSLIP"}</span></td>
                <td className="px-3 py-2"><div className="font-semibold">{p.employeeName}</div><div className="text-[10px] text-slate-500">{p.position}</div></td>
                <td className="px-3 py-2 text-xs">{fmt(p.periodStart)} – {fmt(p.periodEnd)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS[p.status] || STATUS.disbursed}`}>{p.status || "disbursed"}</span></td>
                <td className="px-3 py-2 text-[10px] text-slate-500">{p.approvedBy ? `✓ ${p.approvedBy}` : "—"}{p.disbursedBy ? ` · paid ${p.disbursedBy}` : ""}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.disbursementOr || "—"}</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(p.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
