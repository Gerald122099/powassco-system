// Loan approval queue — Phase 7 ordered chain.
//   manager    → approves PENDING applications (first signature)
//   bookkeeper → approves MANAGER_APPROVED applications (second)
// After both, the loan officer clicks Release on their Loans tab,
// and the cashier pays out from the Disbursements tab.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { ClipboardCheck, Check, X, RefreshCw } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

export default function LoanApprovalsPanel() {
  const { token, user } = useAuth();
  const role = user?.role;
  // Which queue this role owns + which status its approval produces.
  const mine = role === "bookkeeper"
    ? { queue: "manager_approved", to: "approved", title: "Bookkeeper sign-off (after manager)" }
    : { queue: "pending", to: "manager_approved", title: "Manager sign-off (first)" };

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/loan/applications?status=${mine.queue}&limit=50`, { token });
      setItems(res.items || []);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token, mine.queue]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["loans"], load);

  async function act(l, approve) {
    const note = approve ? "" : prompt("Reason for rejecting:", "");
    if (!approve && note === null) return;
    try {
      await apiFetch(`/loan/applications/${l._id}/status`, {
        method: "PATCH",
        token,
        body: { status: approve ? mine.to : "rejected", remarks: note || undefined },
      });
      toast.success(approve ? "Signed — next stage notified." : "Rejected.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ClipboardCheck size={20} className="text-blue-600" /> Loan Approvals
            {items.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{items.length} waiting</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            {mine.title}. Chain: manager → bookkeeper → loan officer releases → cashier disburses.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Applied</th>
              <th className="px-3 py-2">Loan / Borrower</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Term</th>
              <th className="px-3 py-2 text-right">Net proceeds</th>
              <th className="px-3 py-2">Prior sign-offs</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-500">Nothing waiting for your signature. 🎉</td></tr>
            ) : items.map((l) => (
              <tr key={l._id} className="border-t">
                <td className="px-3 py-2 text-xs">{fmt(l.appliedAt || l.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs font-bold">{l.loanId}</div>
                  <div className="font-semibold">{l.borrowerName}</div>
                  <div className="font-mono text-[10px] text-slate-500">{l.borrowerPnNo}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{peso(l.principal)}</td>
                <td className="px-3 py-2 text-right font-mono">{l.termMonths}m</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(l.netProceeds)}</td>
                <td className="px-3 py-2 text-[10px]">
                  {l.managerApprovedBy
                    ? <div className="text-emerald-700">✓ manager: {l.managerApprovedBy}</div>
                    : <div className="text-slate-400">• manager pending</div>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => act(l, true)} className="mr-1 rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Approve"><Check size={14} /></button>
                  <button onClick={() => act(l, false)} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Reject"><X size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
