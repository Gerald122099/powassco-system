import { useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Search, Banknote, Printer, Hourglass, CheckCircle, Wallet } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function LoanDuesLookup() {
  const { token, user } = useAuth();
  const isCashier = ["admin", "cashier"].includes(user?.role);
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Pay modal state
  const [payLoan, setPayLoan] = useState(null);
  const [periods, setPeriods] = useState(1);
  const [payOR, setPayOR] = useState("");
  const [payReceived, setPayReceived] = useState("");
  const [paying, setPaying] = useState(false);
  const [justPaid, setJustPaid] = useState(null);

  function openPay(loan) {
    setPayLoan(loan);
    setPeriods(1);
    setPayOR("");
    setPayReceived(String(loan.monthlyPayment || ""));
  }

  const installmentTotal = payLoan ? Number(payLoan.monthlyPayment || 0) * Number(periods || 1) : 0;

  async function submitPay(e) {
    e?.preventDefault?.();
    if (!payLoan) return;
    const received = Number(payReceived) || 0;
    if (!payOR.trim()) return toast.error("Enter the OR number.");
    if (received < installmentTotal) return toast.error(`Amount received must be at least ₱${installmentTotal.toFixed(2)}.`);
    setPaying(true);
    const target = payLoan;
    const orNo = payOR.trim().toUpperCase();
    const periodsPaid = periods;
    try {
      const res = await apiFetch("/cashier/pay-loan", {
        method: "POST",
        token,
        body: {
          loanId: target.loanId,
          orNo,
          amountReceived: received,
          periodsCovered: periodsPaid,
          method: "cash",
        },
      });
      toast.success(res.message || "Payment posted.");
      setPayLoan(null);
      setJustPaid({
        orNo,
        loanId: target.loanId,
        borrowerName: target.borrowerName,
        borrowerPnNo: target.borrowerPnNo,
        amountDue: installmentTotal,
        amountReceived: received,
        periodsCovered: res.periodsCovered || periodsPaid,
        cbuExcess: res.cbuExcess || 0,
        newCbu: res.newCbuBalance || 0,
        at: new Date(),
      });
      await lookup(null, target.loanId);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setPaying(false);
    }
  }

  function printJustPaidReceipt() {
    if (!justPaid) return;
    const j = justPaid;
    const w = window.open("", "_blank", "width=440,height=640");
    if (!w) return alert("Allow pop-ups to print.");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>OR ${j.orNo}</title>
      <style>@page{size:A6;margin:6mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
      h1{font-size:14px;color:#0f766e;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
      .total{margin-top:8px;text-align:right;font-weight:bold;font-size:15px;color:#b91c1c}
      .ok{color:#15803d}.muted{color:#64748b;font-size:10px}.line{border-bottom:1px dashed #cbd5e1;margin:6px 0}
      </style></head><body>
      <h1>POWASSCO — Loan Payment OR</h1>
      <div class="muted">OR ${j.orNo} • ${j.at.toLocaleString()} • by ${user?.fullName || user?.employeeId || ""}</div>
      <div class="line"></div>
      <div class="row"><span>Borrower</span><b>${j.borrowerName}${j.borrowerPnNo ? " ("+j.borrowerPnNo+")" : ""}</b></div>
      <div class="row"><span>Loan</span><span>${j.loanId} • ${j.periodsCovered} period(s)</span></div>
      <div class="line"></div>
      <div class="row"><span>Amount due (${j.periodsCovered} mo.)</span><span>₱${j.amountDue.toFixed(2)}</span></div>
      <div class="row"><span>Amount received</span><b>₱${j.amountReceived.toFixed(2)}</b></div>
      ${j.cbuExcess > 0 ? `<div class="row"><span>Excess → CBU</span><b class="ok">₱${j.cbuExcess.toFixed(2)}</b></div><div class="row"><span class="muted">New CBU balance</span><span class="muted">₱${j.newCbu.toFixed(2)}</span></div>` : ""}
      <div class="line"></div>
      <div class="total">PAID ₱${j.amountDue.toFixed(2)}</div>
      <div class="muted" style="margin-top:8px">Bring this OR to the Loan Officer for filing. Keep your stub.</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  async function lookup(e) {
    e?.preventDefault?.();
    if (!q.trim()) return;
    setBusy(true);
    setErr("");
    setData(null);
    try {
      const res = await apiFetch(`/cashier/loan?q=${encodeURIComponent(q.trim())}`, { token });
      setData(res);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  function printSlip(loan) {
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return alert("Allow pop-ups to print.");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Loan Dues — ${loan.loanId}</title>
      <style>@page{size:A6;margin:8mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
      h1{font-size:14px;color:#0f766e;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
      .total{margin-top:8px;text-align:right;font-weight:bold;font-size:13px}
      .muted{color:#64748b;font-size:10px}.warn{color:#b91c1c;font-size:10px;margin-top:6px}
      </style></head><body>
      <h1>POWASSCO — Loan Dues Slip</h1>
      <div class="muted">Generated ${new Date().toLocaleString()} by ${user?.fullName || user?.employeeId || ""}</div>
      <div class="row"><span>Loan ID:</span><b>${loan.loanId}</b></div>
      ${loan.referenceCode ? `<div class="row"><span>Reference:</span><b>${loan.referenceCode}</b></div>` : ""}
      <div class="row"><span>Borrower:</span><b>${loan.borrowerName}</b></div>
      <div class="row"><span>Principal:</span><span>${peso(loan.principal)}</span></div>
      <div class="row"><span>Monthly:</span><span>${peso(loan.monthlyPayment)}</span></div>
      <div class="row"><span>Total Paid:</span><span>${peso(loan.totalPaid)}</span></div>
      <div class="total">OUTSTANDING: ${peso(loan.balance)}</div>
      <div class="warn">Hand-write the OR number on the official paper receipt. Consumer must bring the OR to the Loan Officer to post the payment.</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  return (
    <Card>
      <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
        <Banknote size={20} className="text-emerald-600" /> Loan Dues Lookup
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        Search by <b>Loan ID</b>, <b>reference code</b>, <b>borrower name</b>, or <b>PN No</b>. Read-only — collect cash, write a paper OR, then send the consumer to the Loan Officer to post it.
      </p>

      <form onSubmit={lookup} className="mt-4 flex flex-wrap items-stretch gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. LN-0042 / REF12345 / Juan Dela Cruz / AST123"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          {busy ? "Searching…" : "Look up"}
        </button>
      </form>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {data && (
        <div className="mt-5 space-y-4">
          {justPaid && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-emerald-800">✓ Loan payment posted — OR {justPaid.orNo}</div>
                  <div className="mt-0.5 text-xs text-emerald-700">
                    Loan {justPaid.loanId} • {justPaid.periodsCovered} period(s) • paid ₱{justPaid.amountDue.toFixed(2)}{justPaid.cbuExcess > 0 ? ` • excess ₱${justPaid.cbuExcess.toFixed(2)} → CBU (new balance ₱${justPaid.newCbu.toFixed(2)})` : ""}
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-600">
                    The Loan Officer will see this on their next refresh.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={printJustPaidReceipt} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Print OR receipt</button>
                  <button onClick={() => setJustPaid(null)} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Dismiss</button>
                </div>
              </div>
            </div>
          )}
          {data.loans.map((loan) => {
            const pendingForThis = (data.pendingOnline || []).filter((o) => o.loanId === loan.loanId);
            const paymentsForThis = (data.recentPayments || []).filter((p) => p.loanId === loan.loanId);
            return (
              <div key={loan.loanId} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900">{loan.borrowerName}</div>
                    <div className="text-xs text-slate-500">
                      <span className="font-mono font-semibold">{loan.loanId}</span>
                      {loan.referenceCode ? <> • ref <span className="font-mono">{loan.referenceCode}</span></> : null}
                      {loan.borrowerPnNo ? <> • PN <span className="font-mono">{loan.borrowerPnNo}</span></> : null}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-4">
                      <div>Principal: <b className="text-slate-800">{peso(loan.principal)}</b></div>
                      <div>Monthly: <b className="text-slate-800">{peso(loan.monthlyPayment)}</b></div>
                      <div>Term: <b className="text-slate-800">{loan.termMonths} mo</b></div>
                      <div>Interest: <b className="text-slate-800">{loan.interestRatePerMonth}%/mo</b></div>
                      <div>Released: <b className="text-slate-800">{fmtDate(loan.releasedAt)}</b></div>
                      <div>Maturity: <b className="text-slate-800">{fmtDate(loan.maturityDate)}</b></div>
                      <div>Total paid: <b className="text-emerald-700">{peso(loan.totalPaid)}</b></div>
                      <div>Status: <b className={loan.status === "fully_paid" ? "text-emerald-700" : "text-slate-800"}>{loan.status}</b></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Outstanding balance</div>
                    <div className="text-2xl font-extrabold text-red-600">{peso(loan.balance)}</div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                      <button onClick={() => printSlip(loan)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Printer size={13} /> Print slip
                      </button>
                      {isCashier && Number(loan.balance) > 0 && (
                        <button onClick={() => openPay(loan)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                          <Banknote size={13} /> Receive Payment
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {pendingForThis.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <div className="flex items-center gap-2 font-semibold"><Hourglass size={14}/> Online payment(s) pending review</div>
                    <ul className="mt-1 list-disc pl-5">
                      {pendingForThis.map((o) => (
                        <li key={o.referenceId}>Ref <b>{o.referenceId}</b> — {peso(o.amountToPay)}</li>
                      ))}
                    </ul>
                    <p className="mt-1">Confirm with the Loan Officer before accepting another payment to avoid duplicates.</p>
                  </div>
                )}

                {paymentsForThis.length > 0 && (
                  <div className="mt-3 overflow-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">OR No</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Received By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsForThis.map((p) => (
                          <tr key={p._id} className="border-t">
                            <td className="px-3 py-2 text-xs">{fmtDate(p.paidAt)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{p.orNo}</td>
                            <td className="px-3 py-2 text-right">{peso(p.amountPaid)}</td>
                            <td className="px-3 py-2 text-xs">{p.method || "cash"}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{p.receivedBy || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {loan.status === "fully_paid" && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                    <CheckCircle size={12} /> FULLY PAID
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!payLoan} title="Receive Loan Payment" subtitle={payLoan ? `${payLoan.loanId} • ${payLoan.borrowerName}` : ""} onClose={() => setPayLoan(null)} size="sm">
        {payLoan && (
          <form onSubmit={submitPay} className="space-y-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Monthly payment</span><b>{peso(payLoan.monthlyPayment)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Outstanding balance</span><b className="text-red-600">{peso(payLoan.balance)}</b></div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Periods to pay (1 = current, more = advance)</label>
              <div className="mt-1 flex items-center gap-2">
                {[1, 2, 3, 6, 12].map((n) => (
                  <button type="button" key={n} onClick={() => { setPeriods(n); setPayReceived(String(Number(payLoan.monthlyPayment || 0) * n)); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${periods === n ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {n}
                  </button>
                ))}
                <input type="number" min={1} max={60} value={periods} onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setPeriods(n); setPayReceived(String(Number(payLoan.monthlyPayment || 0) * n)); }}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center font-mono" />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Total of {periods} period(s) = <b>{peso(installmentTotal)}</b></div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">OR Number (paper receipt)</label>
              <input value={payOR} onChange={(e) => setPayOR(e.target.value.toUpperCase())} placeholder="e.g. 0010234" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Amount Received (₱)</label>
              <input type="number" step="0.01" min={installmentTotal} value={payReceived} onChange={(e) => setPayReceived(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-right" />
              {Number(payReceived) > installmentTotal && (
                <div className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
                  <Wallet size={11} className="-mt-0.5 mr-1 inline" /> Excess <b>{peso(Number(payReceived) - installmentTotal)}</b> will be added to {payLoan.borrowerName}'s CBU.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayLoan(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button disabled={paying || Number(payReceived) < installmentTotal || !payOR.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {paying ? "Posting…" : "Post Payment"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
