// Cashier "Disbursements" tab — pay out approved expense requests
// filed by admin / manager. Three sections: pending (admin hasn't
// approved yet, view-only), approved (ready to pay — has the
// "Disburse" action), and recent disbursed (today's history).
//
// On Disburse: cashier records the OR / DV number and (optional)
// payment method override + note. The row flips to "disbursed" and
// becomes visible to the bookkeeper's Treasurer's Report cash-out
// section once that ships. No cash-drawer accounting here yet — the
// daily summary is the source of truth.

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Receipt, RefreshCw, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—");

const METHODS = ["cash", "check", "bank", "gcash", "other"];

export default function CashierDisbursementsPanel() {
  const { token } = useAuth();
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [recentDisbursed, setRecentDisbursed] = useState([]);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState(null); // expense being disbursed
  const [orNo, setOrNo] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [p, a, d] = await Promise.all([
        apiFetch("/expenses?status=pending&limit=50", { token }),
        apiFetch("/expenses?status=approved&limit=50", { token }),
        apiFetch("/expenses?status=disbursed&limit=20", { token }),
      ]);
      setPending(p.items || []);
      setApproved(a.items || []);
      setRecentDisbursed(d.items || []);
    } catch (e) {
      toast.error(e.message || "Failed to load disbursements.");
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function open(row) {
    setTarget(row);
    setOrNo("");
    setMethod(row.paymentMethod || "cash");
    setNote("");
  }

  async function disburse() {
    if (!orNo.trim()) { toast.error("OR / DV number is required."); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/expenses/${target._id}/disburse`, {
        method: "POST",
        token,
        body: { disbursementOr: orNo.trim(), paymentMethod: method, notes: note.trim() },
      });
      toast.success(`Disbursed • OR ${orNo.trim()}`);
      setTarget(null);
      load();
    } catch (e) {
      toast.error(e.message || "Failed to disburse.");
    } finally {
      setSubmitting(false);
    }
  }

  const approvedTotal = approved.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pendingTotal = pending.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Receipt size={20} className="text-amber-600" /> Disbursements
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Pay out approved expense requests from admin / manager. Record the OR / DV number when you hand over the cash.
          </div>
        </div>
        <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Top tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Awaiting approval" count={pending.length} total={pendingTotal} tone="amber" icon={Clock} />
        <Tile label="Ready to disburse" count={approved.length} total={approvedTotal} tone="blue" icon={AlertCircle} />
        <Tile label="Disbursed (recent)" count={recentDisbursed.length} total={recentDisbursed.reduce((s, r) => s + Number(r.amount || 0), 0)} tone="emerald" icon={CheckCircle2} />
      </div>

      {/* Approved — the actionable queue */}
      <Section
        title="Ready to disburse"
        rows={approved}
        emptyText="Nothing waiting. Admin hasn't approved any requests yet."
        headers={["Date", "Payee / Category", "Requested by", "Approved by", "Amount", ""]}
        renderRow={(r) => (
          <>
            <td className="px-3 py-2">{fmtDate(r.date)}</td>
            <td className="px-3 py-2">
              <div className="font-semibold">{r.payee || "—"}</div>
              <div className="text-[10px] text-slate-500">{r.category}{r.description ? ` · ${r.description}` : ""}</div>
            </td>
            <td className="px-3 py-2 text-xs text-slate-500">{r.requestedBy || "—"}</td>
            <td className="px-3 py-2 text-xs text-slate-500">{r.approvedBy || "—"}<div className="text-[10px]">{fmtDateTime(r.approvedAt)}</div></td>
            <td className="px-3 py-2 text-right font-bold text-amber-700 font-mono">{peso(r.amount)}</td>
            <td className="px-3 py-2 text-right">
              <button
                onClick={() => open(r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
              >
                <Receipt size={12} /> Disburse
              </button>
            </td>
          </>
        )}
      />

      {/* Pending — view only */}
      <Section
        title="Awaiting approval"
        rows={pending}
        emptyText="No pending requests."
        dim
        headers={["Date", "Payee / Category", "Requested by", "Amount"]}
        renderRow={(r) => (
          <>
            <td className="px-3 py-2">{fmtDate(r.date)}</td>
            <td className="px-3 py-2">
              <div className="font-semibold">{r.payee || "—"}</div>
              <div className="text-[10px] text-slate-500">{r.category}{r.description ? ` · ${r.description}` : ""}</div>
            </td>
            <td className="px-3 py-2 text-xs text-slate-500">{r.requestedBy || "—"}</td>
            <td className="px-3 py-2 text-right font-bold text-slate-600 font-mono">{peso(r.amount)}</td>
          </>
        )}
      />

      {/* Recent — for reference */}
      <Section
        title="Recently disbursed"
        rows={recentDisbursed}
        emptyText="No disbursements yet."
        headers={["Date", "OR / DV", "Payee", "Disbursed by", "Amount"]}
        renderRow={(r) => (
          <>
            <td className="px-3 py-2">{fmtDate(r.date)}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.disbursementOr || "—"}</td>
            <td className="px-3 py-2">
              <div className="font-semibold">{r.payee || "—"}</div>
              <div className="text-[10px] text-slate-500">{r.category}</div>
            </td>
            <td className="px-3 py-2 text-xs text-slate-500">{r.disbursedBy || "—"}<div className="text-[10px]">{fmtDateTime(r.disbursedAt)}</div></td>
            <td className="px-3 py-2 text-right font-mono text-emerald-700">{peso(r.amount)}</td>
          </>
        )}
      />

      {/* Disburse modal */}
      <Modal open={!!target} title="Disburse cash" onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Payee</span> <div className="font-bold">{target.payee || "—"}</div></div>
                <div><span className="text-slate-500">Category</span> <div className="font-bold">{target.category}</div></div>
                <div><span className="text-slate-500">Requested by</span> <div>{target.requestedBy || "—"}</div></div>
                <div><span className="text-slate-500">Approved by</span> <div>{target.approvedBy || "—"}</div></div>
              </div>
              {target.description && <div className="mt-2 text-xs text-slate-600 italic">"{target.description}"</div>}
              <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-amber-800 font-bold">Amount to disburse</span>
                <span className="text-2xl font-bold text-amber-700 font-mono">{peso(target.amount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">OR / DV number *</label>
                <input
                  value={orNo}
                  onChange={(e) => setOrNo(e.target.value)}
                  placeholder="e.g. DV-2026-0123"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm capitalize"
                >
                  {METHODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. received by Juan dela Cruz"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={disburse}
                disabled={submitting || !orNo.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> {submitting ? "Disbursing…" : `Pay out ${peso(target.amount)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Tile({ label, count, total, tone, icon: Icon }) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone] || "";
  return (
    <div className={`rounded-2xl border p-3 ${styles}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide opacity-70 flex items-center gap-1">
          <Icon size={12} /> {label}
        </div>
        <div className="text-base font-bold">{count}</div>
      </div>
      <div className="mt-1 font-mono text-lg font-extrabold">{"₱"}{Number(total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  );
}

function Section({ title, rows, headers, renderRow, emptyText, dim }) {
  return (
    <div className={`mt-4 overflow-hidden rounded-2xl border border-slate-200 ${dim ? "opacity-90" : ""}`}>
      <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[10px] text-slate-500">{rows.length} row(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-500">
            <tr>
              {headers.map((h, i) => {
                const isAmount = h === "Amount";
                const isLastBlank = i === headers.length - 1 && h === "";
                return (
                  <th key={i} className={`px-3 py-2 ${isAmount || isLastBlank ? "text-right" : ""}`}>
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="py-6 text-center text-slate-500 text-xs">{emptyText}</td></tr>
            ) : rows.map((r) => (
              <tr key={r._id} className="border-t">{renderRow(r)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
