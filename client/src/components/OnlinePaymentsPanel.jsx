import { useEffect, useState } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useRealtime } from "../lib/realtime";
import { useAuth } from "../context/AuthContext";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";

function peso(n) {
  return "₱" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function when(d) {
  return d ? new Date(d).toLocaleString() : "—";
}

// Verify queue for consumer online payments. The server scopes by role
// (water_bill_officer → water, loan_officer → loan, admin → all).
export default function OnlinePaymentsPanel({ module }) {
  const { token } = useAuth();
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [orNos, setOrNos] = useState({}); // id -> OR number input

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  useRealtime(["payments"], () => load());
  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ status });
      if (module) qs.set("module", module);
      setItems(await apiFetch(`/payments/online?${qs}`, { token }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function verify(p) {
    const orNo = (orNos[p._id] || "").trim();
    if (!orNo) return setErr("Enter the OR number to verify this payment.");
    setErr("");
    try {
      await apiFetch(`/payments/online/${p._id}/verify`, { method: "POST", token, body: { orNo } });
      flash(`Verified & marked paid (OR ${orNo}).`);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function reject(p) {
    const reason = prompt("Reason for rejecting this payment? (optional)") ?? null;
    if (reason === null) return;
    try {
      await apiFetch(`/payments/online/${p._id}/reject`, { method: "POST", token, body: { reason } });
      flash("Payment rejected.");
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">
            Online Payments {status === "pending" && items.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{items.length} to verify</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Verify consumer QR PH payments, then mark paid with an OR number (method = Online).</div>
        </div>
        <div className="flex gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No {status} online payments.</div>
        ) : (
          items.map((p) => (
            <div key={p._id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">
                    {p.module === "water" ? `${p.accountName || p.pnNo} • ${p.meterNumber} • ${p.periodKey}` : `${p.borrowerName || ""} • Loan ${p.loanId}`}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-600">
                    Ref: <span className="font-mono font-semibold">{p.referenceId}</span> • Paid {peso(p.amountToPay)} (due {peso(p.amountDue)} + fee {peso(p.fee)})
                  </div>
                  <div className="text-xs text-slate-400">
                    Sender: {p.payerName || "—"} • submitted {when(p.createdAt)}
                    {p.orNo ? ` • OR ${p.orNo}` : ""}{p.verifiedBy ? ` • by ${p.verifiedBy}` : ""}
                    {p.rejectionReason ? ` • ${p.rejectionReason}` : ""}
                  </div>
                  {p.receiptImage && (
                    <a href={p.receiptImage} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                      <img src={p.receiptImage} alt="receipt" className="h-20 w-20 rounded-lg border border-slate-200 object-cover hover:opacity-90" title="Open receipt screenshot" />
                    </a>
                  )}
                </div>
                {p.status === "pending" && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <input
                      value={orNos[p._id] || ""}
                      onChange={(e) => setOrNos((s) => ({ ...s, [p._id]: e.target.value }))}
                      placeholder="OR number"
                      className="w-36 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => verify(p)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={13} /> Verify & Pay</button>
                      <button onClick={() => reject(p)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"><XCircle size={13} /> Reject</button>
                    </div>
                  </div>
                )}
                {p.status !== "pending" && (
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{p.status}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
