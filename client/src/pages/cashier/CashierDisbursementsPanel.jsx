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

// Loan payout queue — loans the officer released; cashier hands the
// net proceeds over (drawer-checked server-side) with a voucher OR.
function LoanDisburseQueue({ token }) {
  const [items, setItems] = useState([]);
  const [drawer, setDrawer] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/cashier/loan-disbursements", { token });
      setItems(res.items || []);
      setDrawer(res.drawerNet || 0);
    } catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function disburse(l) {
    const net = Number(l.netProceeds) || (Number(l.principal) || 0) - (Number(l.totalCharges) || 0);
    const orNo = prompt(`Pay out ₱${net.toLocaleString()} to ${l.borrowerName} (${l.loanId}).
OR / voucher number:`, "");
    if (orNo === null || !orNo.trim()) return;
    try {
      const res = await apiFetch("/cashier/disburse-loan", { method: "POST", token, body: { loanId: l.loanId, orNo: orNo.trim() } });
      toast.success(`Disbursed ₱${res.netProceeds.toLocaleString()} — drawer now ₱${res.drawerAfter.toLocaleString()}.`);
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200">
      <div className="flex items-center justify-between bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">
        <span>Loan payouts — approved + released, awaiting cash{items.length > 0 ? ` (${items.length})` : ""}</span>
        <span className="font-mono">Drawer now: ₱{Number(drawer).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">Loan / Borrower</th>
              <th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Deductions</th>
              <th className="px-3 py-2 text-right">Net proceeds</th>
              <th className="px-3 py-2">Sign-offs</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {busy && !items.length ? (
              <tr><td colSpan={6} className="py-6 text-center text-xs text-slate-500">Loading…</td></tr>
            ) : !items.length ? (
              <tr><td colSpan={6} className="py-6 text-center text-xs text-slate-500">No loans waiting for payout.</td></tr>
            ) : items.map((l) => {
              const net = Number(l.netProceeds) || (Number(l.principal) || 0) - (Number(l.totalCharges) || 0);
              const short = drawer < net;
              return (
                <tr key={l._id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs font-bold">{l.loanId}</div>
                    <div className="font-semibold">{l.borrowerName}</div>
                    <div className="font-mono text-[10px] text-slate-500">{l.borrowerPnNo}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">₱{Number(l.principal).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-700">₱{Number(l.totalCharges).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">₱{net.toLocaleString()}</td>
                  <td className="px-3 py-2 text-[10px] text-emerald-700">
                    <div>✓ mgr: {l.managerApprovedBy || "—"}</div>
                    <div>✓ bk: {l.approvedBy || "—"}</div>
                    <div>✓ officer: {l.releasedBy || "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => disburse(l)}
                      disabled={short}
                      title={short ? "Insufficient drawer — request cash from the vault (Treasury tab)" : ""}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      {short ? "Drawer short" : "Disburse"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Payroll + cash-advance payouts approved by the manager.
function PayrollDisburseQueue({ token }) {
  const [items, setItems] = useState([]);
  const [drawer, setDrawer] = useState(0);
  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/cashier/payroll-disbursements", { token });
      setItems(res.items || []);
      setDrawer(res.drawerNet || 0);
    } catch {/* ignore */}
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function pay(p) {
    const net = Number(p.netPay) || 0;
    const orNo = prompt("Pay PHP " + net.toLocaleString() + " to " + p.employeeName + ". OR / voucher number:", "");
    if (orNo === null || !orNo.trim()) return;
    const receivedBy = prompt("Received by (the person who signed the payslip):", p.employeeName || "");
    if (receivedBy === null) return;
    try {
      const res = await apiFetch("/cashier/disburse-payroll", {
        method: "POST", token,
        body: { id: p._id, orNo: orNo.trim(), receivedBy: receivedBy.trim() },
      });
      toast.success("Paid - drawer now PHP " + res.drawerAfter.toLocaleString() + ".");
      load();
    } catch (e) { toast.error(e.message); }
  }

  // Printable payslip: earnings + deductions breakdown and four
  // signature blocks. Cashier prints this FIRST, the employee signs
  // the "Received by" line, then the cashier disburses.
  function printPayslip(p) {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return alert("Allow pop-ups to print.");
    const money = (n) => "PHP " + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const d = (x) => (x ? new Date(x).toLocaleDateString() : "-");
    const lines = (arr, sign) => (arr || []).map((x) => `<tr><td>${x.label || ""}</td><td class="r">${sign}${money(x.amount)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Payslip - ${p.employeeName}</title>
      <style>@page{size:A5;margin:10mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px;margin:0}
      .head{text-align:center;border-bottom:2.5px solid #166534;padding-bottom:6px;margin-bottom:8px}
      .coop{font-size:15px;font-weight:800;color:#166534}.sub{font-size:10px;color:#475569}
      .title{text-align:center;font-size:13px;font-weight:800;color:#166534;letter-spacing:1px;margin:6px 0}
      table{width:100%;border-collapse:collapse;font-size:11px}td,th{padding:3px 6px;border-bottom:1px solid #e2e8f0;text-align:left}
      .r{text-align:right;font-family:monospace}.sect{background:#f1f5f9;font-weight:800;text-transform:uppercase;font-size:10px}
      .net{display:flex;justify-content:space-between;border:2px solid #166534;border-radius:8px;padding:8px 12px;margin-top:10px;font-weight:800}
      .net .amt{font-size:16px;color:#166534;font-family:monospace}
      .sign{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin-top:26px;font-size:10px}
      .sig{text-align:center}.line{border-top:1px solid #0f172a;margin-top:26px;padding-top:3px}
      </style></head><body>
      <div class="head"><div class="coop">POWASSCO MULTIPURPOSE COOPERATIVE</div>
      <div class="sub">Owak, Asturias, Cebu &bull; C.D.A Reg. No. 9520-07014753</div></div>
      <div class="title">${p.type === "cash_advance" ? "CASH ADVANCE SLIP" : "PAYSLIP"}</div>
      <table>
        <tr><td>Employee</td><td class="r"><b>${p.employeeName}</b>${p.employeeCode ? " (" + p.employeeCode + ")" : ""}</td></tr>
        <tr><td>Position</td><td class="r">${p.position || "-"}</td></tr>
        <tr><td>Pay period</td><td class="r">${d(p.periodStart)} - ${d(p.periodEnd)}</td></tr>
        <tr><td>Rate</td><td class="r">${money(p.rate)} / ${p.rateType || "monthly"}${p.daysWorked ? " &bull; " + p.daysWorked + " day(s)" : ""}</td></tr>
      </table>
      ${p.type === "cash_advance" ? "" : `
      <table style="margin-top:8px">
        <tr class="sect"><td colspan="2">Earnings</td></tr>
        <tr><td>Basic pay</td><td class="r">${money(p.basicPay)}</td></tr>
        ${Number(p.overtimePay) > 0 ? `<tr><td>Overtime</td><td class="r">${money(p.overtimePay)}</td></tr>` : ""}
        ${lines(p.allowances, "")}
        <tr><td><b>Gross pay</b></td><td class="r"><b>${money(p.grossPay)}</b></td></tr>
        <tr class="sect"><td colspan="2">Deductions</td></tr>
        <tr><td>SSS</td><td class="r">-${money(p.sss)}</td></tr>
        <tr><td>PhilHealth</td><td class="r">-${money(p.philhealth)}</td></tr>
        <tr><td>Pag-IBIG</td><td class="r">-${money(p.pagibig)}</td></tr>
        <tr><td>Withholding tax</td><td class="r">-${money(p.withholdingTax)}</td></tr>
        ${lines(p.otherDeductions, "-")}
        <tr><td><b>Total deductions</b></td><td class="r"><b>-${money(p.totalDeductions)}</b></td></tr>
      </table>`}
      <div class="net"><span>NET ${p.type === "cash_advance" ? "ADVANCE" : "PAY"}</span><span class="amt">${money(p.netPay)}</span></div>
      <div class="sign">
        <div class="sig"><div class="line">${p.recordedBy || "&nbsp;"}</div>Prepared by (Bookkeeper)</div>
        <div class="sig"><div class="line">${p.approvedBy || "&nbsp;"}</div>Approved by (Manager)</div>
        <div class="sig"><div class="line">&nbsp;</div>Disbursed by (Cashier)</div>
        <div class="sig"><div class="line">&nbsp;</div>Received by (Employee signature)</div>
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  }

  if (!items.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200">
      <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
        <span>Payroll payouts - manager-approved ({items.length})</span>
        <span className="font-mono">Drawer now: {peso(drawer)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((p) => {
            const net = Number(p.netPay) || 0;
            const short = drawer < net;
            return (
              <tr key={p._id} className="border-t">
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.type === "cash_advance" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-800"}`}>
                    {p.type === "cash_advance" ? "ADVANCE" : "PAYSLIP"}
                  </span>
                </td>
                <td className="px-3 py-2"><div className="font-semibold">{p.employeeName}</div><div className="text-[10px] text-slate-500">{p.position} - approved by {p.approvedBy}</div></td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(net)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => printPayslip(p)}
                    className="mr-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50"
                    title="Print the payslip first - the employee signs it before payout">
                    Payslip
                  </button>
                  <button onClick={() => pay(p)} disabled={short}
                    title={short ? "Insufficient drawer - request cash from the vault" : ""}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-40">
                    {short ? "Drawer short" : "Pay out"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// New-member fees (cash IN): membership + tapping fee owed at
// registration. Paying records the OR + a drawer INFLOW.
function MemberFeeQueue({ token }) {
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/cashier/member-fees", { token });
      setItems(res.items || []);
    } catch {/* ignore */}
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function pay(f) {
    const orNo = prompt("Collect PHP " + Number(f.total).toLocaleString() + " from " + f.accountName + " (membership " + f.membershipFee + " + tapping " + f.tappingFee + "). OR number:", "");
    if (orNo === null || !orNo.trim()) return;
    try {
      await apiFetch("/cashier/pay-member-fee", { method: "POST", token, body: { id: f._id, orNo: orNo.trim() } });
      toast.success("Member fees collected.");
      load();
    } catch (e) { toast.error(e.message); }
  }

  if (!items.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200">
      <div className="bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
        New-member fees to collect (cash IN) — {items.length}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((f) => (
            <tr key={f._id} className="border-t">
              <td className="px-3 py-2">
                <div className="font-semibold">{f.accountName}</div>
                <div className="font-mono text-[10px] text-slate-500">{f.pnNo} - filed by {f.requestedBy}</div>
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">membership {peso(f.membershipFee)}{Number(f.tappingFee) > 0 ? " + tapping " + peso(f.tappingFee) : " (no tapping)"}</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(f.total)}</td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => pay(f)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Collect</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CashierDisbursementsPanel() {
  const { token } = useAuth();
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [recentDisbursed, setRecentDisbursed] = useState([]);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState(null); // expense being disbursed
  const [orNo, setOrNo] = useState("");
  const [method, setMethod] = useState("cash");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState("");
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

  async function open(row) {
    setTarget(row);
    setOrNo("");
    setMethod(row.paymentMethod || "cash");
    setNote("");
    setBankAccountId("");
    try {
      const ov = await apiFetch("/treasury/overview", { token });
      setBankAccounts(ov.accounts || []);
    } catch {/* ignore */}
  }

  async function disburse() {
    if (!orNo.trim()) { toast.error("OR / DV number is required."); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/expenses/${target._id}/disburse`, {
        method: "POST",
        token,
        body: { disbursementOr: orNo.trim(), paymentMethod: method, notes: note.trim(), bankAccountId },
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

      {/* Loan payouts (Phase 7 chain) */}
      <LoanDisburseQueue token={token} />

      {/* Payroll + cash-advance payouts (Phase 5) */}
      <PayrollDisburseQueue token={token} />

      {/* New-member fees (Phase 9, cash IN) */}
      <MemberFeeQueue token={token} />

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
            {(method === "bank" || method === "check") && (
              <div>
                <label className="text-xs font-semibold text-slate-600">{method === "check" ? "Cheque drawn on bank account *" : "Pay from bank account *"}</label>
                <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">{"\u2014 pick account \u2014"}</option>
                  {bankAccounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.bankName} - {a.accountNumber} ({peso(a.balance)})</option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] text-slate-500">Deducts the bank balance + writes a treasury OUTFLOW with this DV as reference.</div>
              </div>
            )}
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
