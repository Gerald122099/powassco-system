import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Kpi } from "./WaterDuesLookup";
import PrinterPrompt from "../../components/PrinterPrompt";
import { printPaymentReceipt } from "../../lib/thermalPrint";
import { printReceiptSmart, printReceiptManual } from "../../lib/printerSettings";
import { Search, Banknote, Printer, Hourglass, CheckCircle, Wallet, History, TrendingUp, ReceiptText } from "lucide-react";

const RECENT_KEY = "pow_cashier_recent_loan";
const RECENT_LIMIT = 6;
function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(entry) {
  if (!entry?.loanId) return;
  const prev = loadRecents().filter((r) => r.loanId !== entry.loanId);
  const next = [{ loanId: entry.loanId, borrowerName: entry.borrowerName, balance: entry.balance, at: Date.now() }, ...prev].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

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
  // Set of selected period numbers (1-based) the cashier is about to
  // pay. Replaces the old "next N periods" counter so the cashier can
  // tick specific scheduled installments — useful when catching up
  // legacy loans (paid Jan, Feb, Mar on paper) period-by-period.
  const [periodsSet, setPeriodsSet] = useState(new Set());
  const [payOR, setPayOR] = useState("");
  // Same two-input cash-collected pattern as the water side —
  // explicit bill vs CBU portions.
  const [payReceived, setPayReceived] = useState("");
  const [payCbu, setPayCbu] = useState("");
  const [paySavings, setPaySavings] = useState("");
  const [payExcessTo, setPayExcessTo] = useState("cbu");
  const [paying, setPaying] = useState(false);
  const [justPaid, setJustPaid] = useState(null);
  const [printerPrompt, setPrinterPrompt] = useState(null);

  // Receipt descriptor for a just-paid loan payment (thermal or default-printer).
  function loanReceiptDesc(j) {
    return {
      title: "LOAN PAYMENT OR",
      accountName: j.borrowerName,
      pnNo: j.borrowerPnNo,
      orNo: j.orNo,
      cashierName: user?.fullName || user?.employeeId || "",
      lines: [
        ["Loan", `${j.loanId} (Fixed Dim.)`],
        ["Periods", `${j.periodsCovered} mo.`],
        ...(j.principalPaid > 0 || j.interestPaid > 0 ? [["Capital", peso(j.principalPaid)], ["Interest", peso(j.interestPaid)]] : []),
        ["Amount due", peso(j.amountDue)],
        ["Received", peso(j.amountReceived)],
        ...(j.cbuExcess > 0 ? [["Excess->CBU", peso(j.cbuExcess)], ["New CBU bal", peso(j.newCbu)]] : []),
      ],
      total: j.amountDue,
      totalLabel: "PAID",
      note: "Bring this OR to the Loan Officer.",
    };
  }
  const [todayStats, setTodayStats] = useState(null);
  const [recents, setRecents] = useState(() => loadRecents());
  const searchRef = useRef(null);
  // Map of productLoanId → ₱ amount to settle on this OR.
  const [productLoanPicks, setProductLoanPicks] = useState({});

  function openPay(loan) {
    setPayLoan(loan);
    // Auto-select the NEXT unpaid period — most common cashier
    // action. The picker below lets them add more or untick this one.
    const paidAlready = paidPeriodsForLoan(loan);
    const sched = loan.amortizationSchedule || [];
    const nextUnpaid = sched
      .map((r, i) => Number(r.period ?? i + 1))
      .find((p) => !paidAlready.has(p));
    setPeriodsSet(new Set(nextUnpaid ? [nextUnpaid] : []));
    setPayOR("");
    setPayReceived(String(loan.monthlyPayment || ""));
    setPayCbu("");
    setPaySavings("");
    setPayExcessTo("cbu");
    setProductLoanPicks({});
  }

  // The matching savings account for the borrower of the currently
  // opened pay modal (used to show "balance on file" and disable the
  // input when no account exists).
  const savingsForBorrower = payLoan
    ? (data?.savingsAccounts || []).find((s) => s.pnNo === payLoan.borrowerPnNo)
    : null;

  const productLoanSum = Object.values(productLoanPicks).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  // Open product loans/rentals for this borrower (the cashier loan
  // lookup endpoint returns them on every search result).
  const borrowerProductLoans = (data?.productLoans || []).filter(
    (pl) => pl.pnNo === payLoan?.borrowerPnNo,
  );

  // Build the set of period numbers already paid for a given loan,
  // unioning every prior payment's periodsPaid array. For legacy
  // payments that don't have periodsPaid recorded, fall back to a
  // count-based estimate (totalPaid ÷ monthlyPayment).
  function paidPeriodsForLoan(loan) {
    const set = new Set();
    if (!loan?.loanId) return set;
    const own = (data?.recentPayments || []).filter((p) => p.loanId === loan.loanId);
    for (const p of own) {
      if (Array.isArray(p.periodsPaid) && p.periodsPaid.length > 0) {
        for (const n of p.periodsPaid) set.add(Number(n));
      }
    }
    // Legacy fallback: if no periodsPaid info is recorded for this
    // loan AT ALL, infer "first N periods" from totalPaid/monthly.
    if (set.size === 0) {
      const monthly = Number(loan.monthlyPayment) || 0;
      const approx = monthly > 0 ? Math.floor((Number(loan.totalPaid) || 0) / monthly) : 0;
      for (let i = 1; i <= approx; i++) set.add(i);
    }
    return set;
  }

  // Total ₱ for the currently-ticked periods, summed from the
  // amortization schedule (so it stays right even if monthly payment
  // changed across the term).
  const installmentTotal = useMemo(() => {
    if (!payLoan) return 0;
    const sched = payLoan.amortizationSchedule || [];
    let sum = 0;
    for (const p of periodsSet) {
      const row = sched.find((r, i) => Number(r.period ?? i + 1) === Number(p));
      if (row) sum += Number(row.payment) || 0;
    }
    return Number(sum.toFixed(2));
  }, [payLoan, periodsSet]);

  // Capital (principal) vs interest split of the selected installments,
  // summed from the diminishing-balance schedule rows.
  const installmentSplit = useMemo(() => {
    if (!payLoan) return { principal: 0, interest: 0 };
    const sched = payLoan.amortizationSchedule || [];
    let principal = 0, interest = 0;
    for (const p of periodsSet) {
      const row = sched.find((r, i) => Number(r.period ?? i + 1) === Number(p));
      if (row) { principal += Number(row.principal) || 0; interest += Number(row.interest) || 0; }
    }
    return { principal: Number(principal.toFixed(2)), interest: Number(interest.toFixed(2)) };
  }, [payLoan, periodsSet]);

  async function submitPay(e) {
    e?.preventDefault?.();
    if (!payLoan) return;
    if (periodsSet.size === 0) return toast.error("Tick at least one period to pay.");
    const billPortion = Number(payReceived) || 0;
    const cbuPortion = Math.max(0, Number(payCbu) || 0);
    const savingsPortion = Math.max(0, Number(paySavings) || 0);
    if (savingsPortion > 0 && !savingsForBorrower) {
      return toast.error("Borrower has no savings account. Open one in the Savings tab first.");
    }
    // Same bundling pattern as the water side — pre-build the
    // product-loan payment array and include it in amountReceived
    // so the server can deduct each pick from the right account.
    const productLoanPayments = Object.entries(productLoanPicks)
      .map(([id, amount]) => ({ id, amount: Number(amount) || 0 }))
      .filter((p) => p.amount > 0);
    const totalReceived = billPortion + cbuPortion + savingsPortion + productLoanSum;
    if (!payOR.trim()) return toast.error("Enter the OR number.");
    if (billPortion < installmentTotal) return toast.error(`Loan amount must be at least ₱${installmentTotal.toFixed(2)}.`);
    setPaying(true);
    const target = payLoan;
    const orNo = payOR.trim().toUpperCase();
    // Send the EXPLICIT period numbers the cashier picked. Server
    // records them on LoanPayment.periodsPaid so the history shows
    // exactly which scheduled installments this OR covered.
    const periodsArr = [...periodsSet].map(Number).sort((a, b) => a - b);
    try {
      const res = await apiFetch("/cashier/pay-loan", {
        method: "POST",
        token,
        body: {
          loanId: target.loanId,
          orNo,
          amountReceived: totalReceived,
          periods: periodsArr,
          periodsCovered: periodsArr.length,
          method: "cash",
          productLoanPayments,
          savingsDeposit: savingsPortion,
          cbuContribution: cbuPortion,
          excessTo: payExcessTo,
        },
      });
      toast.success(res.message || "Payment posted.");
      setPayLoan(null);
      const j = {
        orNo,
        loanId: target.loanId,
        borrowerName: target.borrowerName,
        borrowerPnNo: target.borrowerPnNo,
        amountDue: installmentTotal,
        amountReceived: totalReceived,
        periodsCovered: res.periodsCovered || periodsArr.length,
        periodsPaid: periodsArr,
        principalPaid: res.principalPaid ?? installmentSplit.principal,
        interestPaid: res.interestPaid ?? installmentSplit.interest,
        cbuExcess: res.cbuExcess || 0,
        newCbu: res.newCbuBalance || 0,
        at: new Date(),
      };
      setJustPaid(j);
      // Auto-print: thermal printer if ready, else the OS default printer.
      const pr = await printReceiptSmart(loanReceiptDesc(j));
      if (pr.needConnect) setPrinterPrompt({ printFn: () => printPaymentReceipt(loanReceiptDesc(j)) });
      else if (pr.via === "thermal") toast.success("Receipt printed.");
      await lookup(null, target.loanId);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setPaying(false);
    }
  }

  async function printJustPaidReceipt() {
    if (!justPaid) return;
    const res = await printReceiptManual(loanReceiptDesc(justPaid));
    if (res.via === "thermal") toast.success("Receipt printed.");
  }

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    apiFetch("/collections/today?module=loan", { token })
      .then(setTodayStats)
      .catch(() => {});
  }, [token, justPaid]);

  // Auto-debounce the loan search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setData(null); setErr(""); return; }
    const t = setTimeout(() => { lookup(null, term); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function lookup(e, override) {
    e?.preventDefault?.();
    const term = (override ?? q).trim();
    if (!term) return;
    setBusy(true);
    setErr("");
    try {
      const res = await apiFetch(`/cashier/loan?q=${encodeURIComponent(term)}`, { token });
      setData(res);
      if (res?.loans?.length === 1) {
        const l = res.loans[0];
        setRecents(pushRecent({ loanId: l.loanId, borrowerName: l.borrowerName, balance: l.balance }) || []);
      }
    } catch (e2) {
      setErr(e2.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  function openRecent(r) {
    setQ(r.loanId);
    lookup(null, r.loanId);
    searchRef.current?.focus();
  }
  function clearRecents() {
    localStorage.removeItem(RECENT_KEY);
    setRecents([]);
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
      {/* TODAY'S QUICK STATS for loan postings — same shape as the
           Water Cashier view (commit 526ecc4+): bill portion vs CBU
           portion, drawer total, system-wide CBU on file, plus the
           outstanding loan receivable. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Receipts today" value={todayStats?.totals?.loan?.count ?? "—"} icon={CheckCircle} tone="emerald" />
        <Kpi label="Loans paid today" value={peso(todayStats?.totals?.loan?.billCollected ?? 0)} icon={ReceiptText} tone="blue" />
        <Kpi label="CBU collected today" value={peso(todayStats?.totals?.loan?.cbu ?? 0)} icon={Wallet} tone="violet" />
        <Kpi label="Total cash in drawer" value={peso(todayStats?.totals?.loan?.cash ?? 0)} icon={Wallet} tone="amber" />
        <Kpi label="Total CBU on file" value={peso(todayStats?.cbuOnFile?.total ?? 0)} icon={Banknote} tone="emerald" />
        <Kpi label="Outstanding loans" value={peso(todayStats?.outstanding?.loan?.total ?? 0)} icon={ReceiptText} tone="red" />
      </div>
      <div className="mt-2 rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Grand total today (Loan)</div>
            <div className="text-[11px] text-emerald-800/70">
              Loans paid ₱{Number(todayStats?.totals?.loan?.billCollected || 0).toFixed(2)} + CBU ₱{Number(todayStats?.totals?.loan?.cbu || 0).toFixed(2)}
            </div>
          </div>
          <div className="font-mono text-2xl font-extrabold text-emerald-700">
            {peso((todayStats?.totals?.loan?.cash || 0) + (todayStats?.totals?.loan?.online || 0))}
          </div>
        </div>
      </div>

      {/* CBU LEDGER RECONCILIATION — sibling of the water view, same data. */}
      {todayStats?.cbuOnFile && (
        <div className={`mt-2 rounded-2xl border p-3 ${
          Math.abs(Number(todayStats.cbuOnFile.drift || 0)) < 0.01
            ? "border-slate-200 bg-slate-50"
            : "border-red-300 bg-red-50"
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="font-bold uppercase tracking-widest text-slate-600">
              CBU Ledger (matches bookkeeper)
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono">
              <span className="text-emerald-700">
                Credits +₱{Number(todayStats.cbuOnFile.ledger?.credits || 0).toFixed(2)}
                <span className="text-slate-500"> ({todayStats.cbuOnFile.ledger?.creditCount || 0})</span>
              </span>
              <span className="text-red-700">
                Debits −₱{Number(todayStats.cbuOnFile.ledger?.debits || 0).toFixed(2)}
                <span className="text-slate-500"> ({todayStats.cbuOnFile.ledger?.debitCount || 0})</span>
              </span>
              <span className="text-slate-800 font-bold">
                Net ₱{Number(todayStats.cbuOnFile.ledger?.net || 0).toFixed(2)}
              </span>
              <span className="text-slate-800 font-bold">
                On file ₱{Number(todayStats.cbuOnFile.total || 0).toFixed(2)}
              </span>
              {Math.abs(Number(todayStats.cbuOnFile.drift || 0)) >= 0.01 && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 font-bold text-white">
                  Drift ₱{Number(todayStats.cbuOnFile.drift).toFixed(2)} — tell bookkeeper
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 mx-auto max-w-2xl">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
            <Banknote size={18} className="text-emerald-600" /> Loan Dues Lookup
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Just type — search is automatic. Loan ID, reference, borrower, or PN.
          </div>
        </div>
        <div className="mt-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setData(null); setErr(""); } }}
            placeholder="LN-0042,  REF12345,  Juan Dela Cruz,  or  AST123…"
            autoComplete="off"
            className="w-full rounded-2xl border-2 border-slate-200 pl-12 pr-12 py-4 text-base font-semibold focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100 shadow-sm"
          />
          {q && (
            <button
              onClick={() => { setQ(""); setData(null); setErr(""); searchRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ×
            </button>
          )}
          {busy && (
            <div className="absolute -bottom-5 left-0 right-0 text-center text-[11px] text-slate-400">Searching…</div>
          )}
        </div>

        {recents.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-1"><History size={12} /> Recent</span>
              <button onClick={clearRecents} className="text-slate-400 hover:text-slate-700">Clear</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r.loanId}
                  onClick={() => openRecent(r)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200"
                >
                  <span className="font-mono">{r.loanId}</span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate max-w-[160px]">{r.borrowerName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-bold text-slate-900">{loan.borrowerName}</div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Fixed Diminishing</span>
                    </div>
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
            {/* Period picker — checklist of every scheduled
                 installment. Paid periods are dimmed and disabled;
                 unpaid periods are tickable so the cashier can pick
                 exactly which months this OR settles. The Loan
                 portion input auto-syncs with the sum of selected
                 periods. */}
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Periods to pay ({periodsSet.size} selected)
              </label>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {(() => {
                  // If the server didn't ship amortizationSchedule
                  // (older API, or legacy loan), synthesise rows from
                  // termMonths + monthlyPayment + firstPaymentDate
                  // so the cashier can still pick periods. Without
                  // dueDate we show "—" but the payment ₱ stays
                  // correct.
                  let sched = payLoan.amortizationSchedule || [];
                  if (sched.length === 0) {
                    const term = Math.max(1, Number(payLoan.termMonths) || 0);
                    const monthly = Number(payLoan.monthlyPayment) || 0;
                    if (term > 0 && monthly > 0) {
                      const first = payLoan.firstPaymentDate ? new Date(payLoan.firstPaymentDate) : null;
                      sched = Array.from({ length: term }, (_, i) => {
                        const due = first ? new Date(first) : null;
                        if (due) due.setMonth(due.getMonth() + i);
                        return { period: i + 1, payment: monthly, dueDate: due };
                      });
                    }
                  }
                  if (sched.length === 0) {
                    return <div className="px-3 py-3 text-xs text-slate-500">No amortization schedule available — use the legacy "pay next N installments" mode by ticking nothing and entering the total amount manually.</div>;
                  }
                  const paidSet = paidPeriodsForLoan(payLoan);
                  return sched.map((row, idx) => {
                    const n = Number(row.period ?? idx + 1);
                    const due = row.dueDate ? new Date(row.dueDate) : null;
                    const isPaid = paidSet.has(n);
                    const isChecked = periodsSet.has(n);
                    return (
                      <label
                        key={n}
                        className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 text-sm ${
                          isPaid
                            ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                            : "hover:bg-emerald-50 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isPaid || isChecked}
                          disabled={isPaid}
                          onChange={(e) => {
                            setPeriodsSet((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(n);
                              else next.delete(n);
                              // Keep the Loan-portion input in sync.
                              let sum = 0;
                              for (const p of next) {
                                const r = sched.find((s, i) => Number(s.period ?? i + 1) === p);
                                if (r) sum += Number(r.payment) || 0;
                              }
                              setPayReceived(sum > 0 ? sum.toFixed(2) : "");
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                        <span className="font-semibold tabular-nums w-16">Period {n}</span>
                        <span className="text-xs text-slate-500 flex-1">
                          {due ? due.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                        </span>
                        <span className="text-right leading-tight">
                          <span className="font-mono text-xs block">{peso(row.payment)}</span>
                          {(Number(row.principal) > 0 || Number(row.interest) > 0) && (
                            <span className="block text-[9px] text-slate-400 font-mono">cap {peso(row.principal)} · int {peso(row.interest)}</span>
                          )}
                        </span>
                        {isPaid && <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">PAID</span>}
                      </label>
                    );
                  });
                })()}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Tick the periods being paid with this OR.</span>
                <span>Selected total = <b>{peso(installmentTotal)}</b></span>
              </div>
              {/* Capital / interest split of the selected installments
                  (fixed diminishing-balance). */}
              {periodsSet.size > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-indigo-500">Capital</div>
                    <div className="text-sm font-bold text-indigo-800">{peso(installmentSplit.principal)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-indigo-500">Interest</div>
                    <div className="text-sm font-bold text-indigo-800">{peso(installmentSplit.interest)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-indigo-500">Payment</div>
                    <div className="text-sm font-bold text-indigo-900">{peso(installmentTotal)}</div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">OR Number (paper receipt)</label>
              <input value={payOR} onChange={(e) => setPayOR(e.target.value.toUpperCase())} placeholder="e.g. 0010234" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Amount for Loan (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min={installmentTotal}
                  value={payReceived}
                  onChange={(e) => setPayReceived(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-right"
                />
                <div className="mt-1 text-[10px] text-slate-500">Must be ≥ ₱{installmentTotal.toFixed(2)}.</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Add to CBU (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payCbu}
                  onChange={(e) => setPayCbu(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2.5 font-mono text-right"
                />
                <div className="mt-1 text-[10px] text-slate-500">Optional. Extra for Capital Build-Up.</div>
              </div>
            </div>

            {/* Product-loan / rental balances owned by THIS borrower —
                bundled onto the same OR receipt when ticked. Same
                pattern as the water-pay modal. */}
            {borrowerProductLoans.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-violet-800 mb-2">
                  Include product-loan / rental balances on this OR
                </div>
                <div className="space-y-1.5">
                  {borrowerProductLoans.map((pl) => {
                    const checked = pl._id in productLoanPicks;
                    return (
                      <label
                        key={pl._id}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm cursor-pointer transition ${
                          checked
                            ? "border-violet-300 bg-white shadow-sm"
                            : "border-slate-200 bg-white hover:bg-violet-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setProductLoanPicks((prev) => {
                              const next = { ...prev };
                              if (e.target.checked) {
                                next[pl._id] = Number(pl.balance || 0).toFixed(2);
                              } else {
                                delete next[pl._id];
                              }
                              return next;
                            });
                          }}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">
                            {pl.productName}
                            <span className="ml-2 text-[10px] font-mono uppercase rounded bg-slate-100 px-1.5 py-0.5">
                              {pl.transactionType}
                            </span>
                            {pl.productCategory && (
                              <span className="ml-1 text-[10px] text-slate-500">· {pl.productCategory}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            balance {peso(pl.balance)}
                            {pl.dueDate && ` · due ${new Date(pl.dueDate).toLocaleDateString("en-PH", { year: "2-digit", month: "short", day: "numeric" })}`}
                            {pl.transactionType === "rental" && pl.returnDate &&
                              ` · return ${new Date(pl.returnDate).toLocaleDateString("en-PH", { year: "2-digit", month: "short", day: "numeric" })}`}
                          </div>
                        </div>
                        {checked && (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={pl.balance}
                            value={productLoanPicks[pl._id]}
                            onChange={(e) =>
                              setProductLoanPicks((prev) => ({ ...prev, [pl._id]: e.target.value }))
                            }
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 font-mono text-sm text-right"
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
                {productLoanSum > 0 && (
                  <div className="mt-2 text-[11px] text-violet-800 font-semibold text-right">
                    Product-loan portion: <b>{peso(productLoanSum)}</b>
                  </div>
                )}
              </div>
            )}

            {/* Same three-line breakdown as the Water side: total
                cash from the member, posted-to-loan portion, CBU
                extracted. Live-updates with the inputs. */}
            {(() => {
              const billNum = Number(payReceived) || 0;
              const cbuNum = Math.max(0, Number(payCbu) || 0);
              const savingsNum = Math.max(0, Number(paySavings) || 0);
              const totalNum = billNum + cbuNum + savingsNum + productLoanSum;
              return (
                <>
                  {/* Same bundle inputs as the Water side. */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-2">
                      <label className="text-[11px] font-bold uppercase tracking-wide text-pink-700">
                        Savings deposit (optional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={paySavings}
                        onChange={(e) => setPaySavings(e.target.value)}
                        disabled={!savingsForBorrower}
                        placeholder={savingsForBorrower ? "0.00" : "No savings account"}
                        className="mt-1 w-full rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm font-mono disabled:opacity-50"
                      />
                      {savingsForBorrower ? (
                        <div className="mt-0.5 text-[10px] text-pink-700">
                          Balance on file: {peso(savingsForBorrower.balance || 0)}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          Open one in the Savings tab to bundle.
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-2">
                      <label className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                        Direct CBU contribution (optional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={payCbu}
                        onChange={(e) => setPayCbu(e.target.value)}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-mono"
                      />
                      <div className="mt-0.5 text-[10px] text-violet-700">
                        Posted as an explicit CBU credit on this OR.
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Amount received from member</span>
                      <span className="font-mono text-xl font-extrabold text-emerald-900">{peso(totalNum)}</span>
                    </div>
                    <div className="flex items-center justify-between pl-3">
                      <span className="text-xs text-slate-700">↳ Posted to loan</span>
                      <span className="font-mono text-sm font-bold text-slate-800">{peso(billNum)}</span>
                    </div>
                    {productLoanSum > 0 && (
                      <div className="flex items-center justify-between pl-3">
                        <span className="text-xs text-violet-700">↳ Applied to product loan(s)</span>
                        <span className="font-mono text-sm font-bold text-violet-800">+{peso(productLoanSum)}</span>
                      </div>
                    )}
                    {savingsNum > 0 && (
                      <div className="flex items-center justify-between pl-3">
                        <span className="text-xs text-pink-700">↳ Savings deposit</span>
                        <span className="font-mono text-sm font-bold text-pink-800">+{peso(savingsNum)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pl-3">
                      <span className="text-xs text-violet-700"><Wallet size={11} className="-mt-0.5 mr-1 inline" />↳ Extracted to CBU</span>
                      <span className="font-mono text-sm font-bold text-violet-800">+{peso(cbuNum)}</span>
                    </div>
                    {billNum > installmentTotal && (
                      <div className="mt-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-emerald-800">
                            Excess {peso(billNum - installmentTotal)} →
                          </span>
                          {[
                            ["cbu", "CBU"],
                            ["savings", "Savings"],
                            ["split", "Split 50/50"],
                          ].map(([k, label]) => (
                            <label key={k} className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${payExcessTo === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"} ${k !== "cbu" && !savingsForBorrower ? "opacity-40 cursor-not-allowed" : ""}`}>
                              <input
                                type="radio"
                                name="loanExcessTo"
                                value={k}
                                checked={payExcessTo === k}
                                disabled={k !== "cbu" && !savingsForBorrower}
                                onChange={() => setPayExcessTo(k)}
                                className="hidden"
                              />
                              {label}
                            </label>
                          ))}
                          {!savingsForBorrower && (
                            <span className="text-[10px] text-slate-400">(no savings account)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayLoan(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button disabled={paying || Number(payReceived) < installmentTotal || !payOR.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {paying ? "Posting…" : "Post Payment"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <PrinterPrompt
        open={!!printerPrompt}
        onClose={() => setPrinterPrompt(null)}
        printFn={printerPrompt?.printFn}
        onPrinted={() => toast.success("Receipt printed.")}
      />
    </Card>
  );
}
