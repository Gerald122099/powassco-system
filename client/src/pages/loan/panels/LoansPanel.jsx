import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../lib/api";
import { useRealtime } from "../../../lib/realtime";
import { useAuth } from "../../../context/AuthContext";
import { printApplication, printDisclosure, printPromissory, printReceipt } from "../../../lib/loanPrint";
import { Eye, FileText, FileSpreadsheet, ScrollText, CheckCircle2, XCircle, Banknote } from "lucide-react";

const PAGE_SIZE = 12;

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dt(d) {
  return d ? new Date(d).toLocaleDateString() : "—";
}
function monthOptions(back = 18) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < back; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

const STATUS_TONE = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  released: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-700",
  rejected: "bg-red-100 text-red-700",
};
const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-bold text-slate-900">{value ?? "—"}</div>
    </div>
  );
}

export default function LoansPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [viewing, setViewing] = useState(null);
  const [releaseFor, setReleaseFor] = useState(null);
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().slice(0, 10));
  const [payFor, setPayFor] = useState(null);
  const [orNo, setOrNo] = useState("");
  const [amount, setAmount] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useRealtime(["loans", "payments"], () => load());
  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, status, month, page: String(page), limit: String(PAGE_SIZE) });
      const data = await apiFetch(`/loan/applications?${qs}`, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [q, status, month, page]);

  function flash(m) {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  }

  async function openView(row) {
    setErr("");
    try {
      setViewing(await apiFetch(`/loan/applications/${row._id}`, { token }));
    } catch (e) {
      setErr(e.message);
    }
  }
  async function changeStatus(id, next, extra = {}) {
    setErr("");
    try {
      await apiFetch(`/loan/applications/${id}/status`, { method: "PATCH", token, body: { status: next, ...extra } });
      flash(`Updated to ${next}.`);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function doRelease() {
    if (!releaseFor) return;
    await changeStatus(releaseFor._id, "released", { disbursedAt: disburseDate });
    setReleaseFor(null);
  }
  async function recordPayment() {
    if (!payFor) return;
    const amt = Number(amount || 0);
    if (!(amt > 0)) {
      setErr("Enter the amount received.");
      return;
    }
    setErr("");
    try {
      const res = await apiFetch(`/loan/applications/${payFor._id}/payments`, {
        method: "POST",
        token,
        body: { orNo: orNo.trim(), amountPaid: amt },
      });
      flash(`Payment recorded (${res.payment.orNo}).`);
      setPayFor(null);
      setOrNo("");
      setAmount("");
      await load();
      printReceipt({ loan: res.loan, payment: res.payment }); // issue invoice
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">Loans</div>
          <div className="mt-0.5 text-sm text-slate-500">Manage applications, release, and record payments.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search loan / PN / name" className={`w-full sm:w-56 ${inputCls}`} />
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className={inputCls}>
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="released">Released</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={month} onChange={(e) => { setPage(1); setMonth(e.target.value); }} className={inputCls}>
            <option value="">All months</option>
            {monthOptions(18).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={load} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Refresh</button>
        </div>
      </div>

      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{toast}</div>}
      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Loan</th>
              <th className="px-4 py-3">Borrower</th>
              <th className="px-4 py-3 text-right">Principal</th>
              <th className="px-4 py-3 text-right">Monthly</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-slate-500">No loans found.</td></tr>
            ) : (
              items.map((x) => (
                <tr key={x._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900 font-mono">{x.loanId}</div>
                    <div className="text-xs text-slate-500">{dt(x.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{x.borrowerName}</div>
                    <div className="text-xs text-slate-500">{x.borrowerPnNo}</div>
                  </td>
                  <td className="px-4 py-3 text-right">₱ {money(x.principal)}</td>
                  <td className="px-4 py-3 text-right">₱ {money(x.monthlyPayment)}</td>
                  <td className="px-4 py-3 text-right">₱ {money(x.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_TONE[x.status] || "bg-slate-100 text-slate-700"}`}>{x.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button onClick={() => openView(x)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"><Eye size={13} /> View</button>
                      {x.status === "pending" && (
                        <>
                          <button onClick={() => changeStatus(x._id, "approved")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={13} /> Approve</button>
                          <button onClick={() => changeStatus(x._id, "rejected")} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"><XCircle size={13} /> Reject</button>
                        </>
                      )}
                      {x.status === "approved" && (
                        <button onClick={() => { setReleaseFor(x); setDisburseDate(new Date().toISOString().slice(0, 10)); }} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Release</button>
                      )}
                      {x.status === "released" && (
                        <button onClick={() => { setPayFor(x); setOrNo(""); setAmount(""); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"><Banknote size={13} /> Pay</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">Showing <b>{items.length}</b> of <b>{total}</b></div>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <div className="text-sm font-semibold text-slate-700">Page {page} / {totalPages}</div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>

      {/* View modal */}
      <Modal open={!!viewing} title={viewing ? `Loan ${viewing.loanId}` : "Loan"} subtitle={viewing?.borrowerName} onClose={() => setViewing(null)} size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => printApplication(viewing)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><FileText size={15} /> Application</button>
              <button onClick={() => printDisclosure(viewing)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><FileSpreadsheet size={15} /> Disclosure</button>
              <button onClick={() => printPromissory(viewing)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50"><ScrollText size={15} /> Promissory</button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Reference Code" value={viewing.referenceCode} />
              <Info label="Status" value={viewing.status} />
              <Info label="Borrower" value={`${viewing.borrowerName} (${viewing.borrowerPnNo})`} />
              <Info label="Principal" value={`₱ ${money(viewing.principal)}`} />
              <Info label="Interest / mo" value={`${viewing.interestRatePerMonth}%`} />
              <Info label="Term" value={`${viewing.termMonths} months`} />
              <Info label="Monthly Payment" value={`₱ ${money(viewing.monthlyPayment)}`} />
              <Info label="Total Payable" value={`₱ ${money(viewing.totalPayment)}`} />
              <Info label="Total Interest" value={`₱ ${money(viewing.totalInterest)}`} />
              <Info label="Charges" value={`₱ ${money(viewing.totalCharges)}`} />
              <Info label="Net Proceeds" value={`₱ ${money(viewing.netProceeds)}`} />
              <Info label="Balance" value={`₱ ${money(viewing.balance)}`} />
              <Info label="Released / Disbursed" value={dt(viewing.releasedAt)} />
              <Info label="1st Installment" value={dt(viewing.firstPaymentDate)} />
              <Info label="Maturity / Due" value={dt(viewing.maturityDate)} />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-800">Amortization Schedule</div>
              <div className="overflow-auto rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr><th className="px-3 py-2">#</th><th className="px-3 py-2 text-right">Payment</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Due</th></tr>
                  </thead>
                  <tbody>
                    {(viewing.amortizationSchedule || []).map((r) => (
                      <tr key={r.period} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.period}</td>
                        <td className="px-3 py-2 text-right">{money(r.payment)}</td>
                        <td className="px-3 py-2 text-right">{money(r.principal)}</td>
                        <td className="px-3 py-2 text-right">{money(r.interest)}</td>
                        <td className="px-3 py-2 text-right">{money(r.balance)}</td>
                        <td className="px-3 py-2">{dt(r.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-slate-800">Payments</div>
              {(viewing.payments || []).length === 0 ? (
                <div className="text-sm text-slate-500">No payments recorded yet.</div>
              ) : (
                <div className="space-y-1">
                  {viewing.payments.map((p) => (
                    <div key={p._id || p.orNo} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <span className="text-slate-600">OR {p.orNo} • {dt(p.paidAt)} • {p.method}</span>
                      <span className="font-bold text-slate-900">₱ {money(p.amountPaid)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Release modal */}
      <Modal open={!!releaseFor} title="Release Loan" subtitle={releaseFor ? releaseFor.loanId : ""} onClose={() => setReleaseFor(null)}>
        {releaseFor && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">Releasing <b>₱ {money(releaseFor.principal)}</b> to {releaseFor.borrowerName}. Net proceeds <b>₱ {money(releaseFor.netProceeds)}</b>.</div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Date of Disbursement</label>
              <input type="date" value={disburseDate} onChange={(e) => setDisburseDate(e.target.value)} className={`mt-1 w-full ${inputCls}`} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReleaseFor(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={doRelease} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Release Loan</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment modal — OR # + amount only */}
      <Modal open={!!payFor} title="Record Payment" subtitle={payFor ? payFor.loanId : ""} onClose={() => setPayFor(null)}>
        {payFor && (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">Balance: <b>₱ {money(payFor.balance)}</b></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">OR No.</label>
                <input value={orNo} onChange={(e) => setOrNo(e.target.value)} placeholder="OR-001 (optional)" className={`mt-1 w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount Received (₱)</label>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`mt-1 w-full ${inputCls}`} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={recordPayment} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Record & Print Receipt</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
