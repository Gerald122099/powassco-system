// Dual-control balance adjustments (CBU / Savings).
//
// Same component serves two roles:
//   • admin       — can FILE a new adjustment request (credit or debit
//                   against a member's CBU or savings) and watch its status
//   • bookkeeper  — sees the pending queue and APPROVES or REJECTS;
//                   approval is the moment money actually moves
//
// Money only moves after both roles have acted — requester ≠ approver.

import { useEffect, useState, useCallback } from "react";
import Card from "./Card";
import Modal from "./Modal";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { Scale, Plus, Check, X, RefreshCw, AlertCircle } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

export default function AdjustmentsPanel() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isBookkeeper = user?.role === "bookkeeper";

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  // New-request modal (admin)
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ module: "cbu", pnNo: "", refId: "", type: "credit", amount: "", reason: "" });
  const [memberLookup, setMemberLookup] = useState({ status: "idle", name: "", error: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await apiFetch(`/adjustments${qs}`, { token });
      setItems(res.items || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }, [token, statusFilter]);
  useEffect(() => { load(); }, [load]);

  // Debounced member-name lookup on the request form.
  useEffect(() => {
    if (!open) return;
    const pn = form.pnNo.trim();
    if (!pn) { setMemberLookup({ status: "idle", name: "", error: "" }); return; }
    setMemberLookup((p) => ({ ...p, status: "loading" }));
    const t = setTimeout(async () => {
      try {
        const m = await apiFetch(`/water/members/pn/${encodeURIComponent(pn.toUpperCase())}`, { token });
        setMemberLookup({ status: "found", name: m.accountName || "", error: "" });
      } catch (e) {
        setMemberLookup({ status: "missing", name: "", error: e.message || "Not found" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.pnNo, open, token]);

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  async function submit() {
    if (!form.pnNo.trim()) return toast.error("Account number is required.");
    if (form.module === "loan" && !form.refId.trim()) return toast.error("Loan ID is required for loan adjustments.");
    if (!(Number(form.amount) > 0)) return toast.error("Enter an amount greater than 0.");
    if (!form.reason.trim()) return toast.error("A reason is required — it goes on the permanent record.");
    setSubmitting(true);
    try {
      await apiFetch("/adjustments", {
        method: "POST",
        token,
        body: {
          module: form.module,
          pnNo: form.pnNo.trim().toUpperCase(),
          refId: form.refId.trim().toUpperCase(),
          type: form.type,
          amount: Number(form.amount),
          reason: form.reason.trim(),
        },
      });
      toast.success("Adjustment filed — awaiting bookkeeper approval.");
      setOpen(false);
      setForm({ module: "cbu", pnNo: "", refId: "", type: "credit", amount: "", reason: "" });
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function review(row, action) {
    const note = prompt(
      action === "approve"
        ? `Approve ${row.type.toUpperCase()} of ${peso(row.amount)} to ${row.accountName} (${row.module.toUpperCase()})?\nOptional note:`
        : "Reason for rejecting:",
      ""
    );
    if (note === null) return;
    try {
      const res = await apiFetch(`/adjustments/${row._id}/${action}`, { method: "POST", token, body: { note } });
      if (action === "approve") {
        toast.success(`Applied. New balance: ${peso(res.balanceAfter)}`);
      } else {
        toast.success("Rejected — no money moved.");
      }
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Scale size={20} className="text-indigo-600" /> Balance Adjustments
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Dual-control: admin files a CBU / savings adjustment, bookkeeper approves before the balance moves.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 p-1 text-xs font-semibold">
            {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([k, label]) => (
              <button
                key={k || "all"}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={`rounded-lg px-3 py-1 ${statusFilter === k ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> New Adjustment
            </button>
          )}
        </div>
      </div>

      {isBookkeeper && items.some((i) => i.status === "pending") && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
          <AlertCircle size={14} />
          {items.filter((i) => i.status === "pending").length} adjustment(s) awaiting your review. Money moves only after you approve.
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Filed</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Requested by</th>
                <th className="px-3 py-2">Reviewed by</th>
                <th className="px-3 py-2 text-right">Balance after</th>
                {isBookkeeper && <th className="px-3 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {!items.length ? (
                <tr><td colSpan={isBookkeeper ? 11 : 10} className="py-10 text-center text-slate-500">No adjustments{statusFilter ? ` with status "${statusFilter}"` : ""}.</td></tr>
              ) : items.map((row) => (
                <tr key={row._id} className="border-t">
                  <td className="px-3 py-2 text-xs">{fmtDateTime(row.requestedAt || row.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                    {row.appliedRefOrNo && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{row.appliedRefOrNo}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.module === "cbu" ? "bg-blue-100 text-blue-700" : row.module === "loan" ? "bg-violet-100 text-violet-700" : "bg-pink-100 text-pink-700"}`}>
                      {row.module.toUpperCase()}
                    </span>
                    {row.refId && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{row.refId}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{row.accountName}</div>
                    <div className="font-mono text-[10px] text-slate-500">{row.pnNo}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-bold ${row.type === "credit" ? "text-emerald-700" : "text-rose-700"}`}>
                      {row.type === "credit" ? "+ CREDIT" : "− DEBIT"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{peso(row.amount)}</td>
                  <td className="px-3 py-2 max-w-[16rem]">
                    <div className="text-xs text-slate-700 line-clamp-2" title={row.reason}>{row.reason}</div>
                    {row.reviewNote && <div className="text-[10px] italic text-slate-500" title={row.reviewNote}>↳ {row.reviewNote}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.requestedBy || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.reviewedBy || "—"}
                    {row.reviewedAt && <div className="text-[10px] text-slate-500">{fmtDateTime(row.reviewedAt)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {row.balanceAfter !== null && row.balanceAfter !== undefined ? peso(row.balanceAfter) : "—"}
                  </td>
                  {isBookkeeper && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.status === "pending" ? (
                        <>
                          <button onClick={() => review(row, "approve")} className="mr-1 inline-flex items-center justify-center rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Approve & apply">
                            <Check size={14} />
                          </button>
                          <button onClick={() => review(row, "reject")} className="inline-flex items-center justify-center rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" title="Reject">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400">done</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin: new request modal */}
      <Modal open={open} title="File Balance Adjustment" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            This files a REQUEST. The balance does not change until a bookkeeper approves it.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Ledger</label>
              <select value={form.module} onChange={(e) => setF("module", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="cbu">Share Capital (CBU)</option>
                <option value="savings">Voluntary Savings</option>
                <option value="loan">Loan (paid amount)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Direction</label>
              <select value={form.type} onChange={(e) => setF("type", e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                <option value="credit">Credit (+ add)</option>
                <option value="debit">Debit (− subtract)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Account number</label>
            <input
              value={form.pnNo}
              onChange={(e) => setF("pnNo", e.target.value)}
              placeholder="e.g. ABC123"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase"
            />
            {memberLookup.status === "found" && (
              <div className="mt-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">✓ {memberLookup.name}</div>
            )}
            {memberLookup.status === "missing" && (
              <div className="mt-1 rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-700">{memberLookup.error}</div>
            )}
          </div>
          {form.module === "loan" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Loan ID</label>
              <input
                value={form.refId}
                onChange={(e) => setF("refId", e.target.value)}
                placeholder="e.g. LN-2026-0012"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase"
              />
              <div className="mt-1 text-[10px] text-slate-500">
                Credit = record additional paid amount (balance shrinks). Debit = reduce recorded paid (balance grows).
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-600">Amount (₱)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setF("amount", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Reason (required — permanent record)</label>
            <textarea
              value={form.reason}
              onChange={(e) => setF("reason", e.target.value)}
              rows={2}
              placeholder="e.g. Correction of OR 40751 posted to the wrong account"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button
              onClick={submit}
              disabled={submitting || !form.pnNo.trim() || !(Number(form.amount) > 0) || !form.reason.trim()}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Filing…" : "File Request"}
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
