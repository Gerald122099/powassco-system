import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import PrinterPrompt from "../../components/PrinterPrompt";
import { printPaymentReceipt } from "../../lib/thermalPrint";
import { printReceiptSmart, printReceiptManual } from "../../lib/printerSettings";
import { printHtmlDoc } from "../../lib/printHtmlDoc";
import { Search, Droplets, Printer, AlertTriangle, MapPin, CheckCircle, Hourglass, Gauge, Banknote, History, Wallet, TrendingUp, ReceiptText, BadgeCheck, Loader2 } from "lucide-react";

// Recently-looked-up PNs are kept in localStorage so the cashier can
// re-open a customer with one tap (e.g. when they walk back after
// stepping out for cash). Cap is small on purpose — old entries fall
// off the list rather than crowding the UI.
const RECENT_KEY = "pow_cashier_recent_water";
const RECENT_LIMIT = 6;
function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(entry) {
  if (!entry?.pnNo) return;
  const prev = loadRecents().filter((r) => r.pnNo !== entry.pnNo);
  const next = [{ pnNo: entry.pnNo, accountName: entry.accountName, totalDue: entry.totalDue, at: Date.now() }, ...prev].slice(0, RECENT_LIMIT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function WaterDuesLookup() {
  const { token, user } = useAuth();
  const isCashier = ["admin", "cashier"].includes(user?.role);
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [receivables, setReceivables] = useState(null); // { loading } | full payload
  async function openReceivables(pnNo) {
    setReceivables({ loading: true });
    try { setReceivables(await apiFetch(`/cashier/receivables?pnNo=${encodeURIComponent(pnNo)}`, { token })); }
    catch (e) { toast.error(e.message); setReceivables(null); }
  }
  // Collect a meter's reconnection fee → queues it for reconnection (plumber).
  async function collectReconnection(pnNo, meterNumber, fee) {
    const orNo = window.prompt(`Collect ₱${Number(fee).toFixed(2)} reconnection fee for meter ${meterNumber}. OR number:`, "");
    if (orNo === null || !orNo.trim()) return;
    try {
      const res = await apiFetch("/cashier/collect-reconnection", { method: "POST", token, body: { pnNo, meterNumber, orNo: orNo.trim() } });
      toast.success(res.message || "Collected — queued for reconnection.");
      await openReceivables(pnNo);
      if (data?.member?.pnNo === pnNo) await lookup(null, pnNo);
    } catch (e) { toast.error(e.message); }
  }
  // Payment modal: { bill, totalDue }
  const [settingMeter, setSettingMeter] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payOR, setPayOR] = useState("");
  // Two-input cash-collected model:
  //   payReceived       = the bill portion the cashier is collecting
  //                       (defaults to the full totalDue on open).
  //   payCbu            = optional ADDITIONAL cash the member is paying
  //                       into their CBU on top of the bill. Defaults
  //                       to 0. Cashier types whatever extra was handed
  //                       over for CBU and the modal shows the combined
  //                       total to collect.
  const [payReceived, setPayReceived] = useState("");
  const [payCbu, setPayCbu] = useState("");
  const [paying, setPaying] = useState(false);
  // Highlight the just-paid bill + post-pay receipt info for printing.
  const [justPaid, setJustPaid] = useState(null); // { orNo, period, meter, amountDue, amountReceived, cbuExcess, newCbu, accountName, pnNo }
  // Holds a pending receipt print fn when auto-print is on but no printer is
  // connected → opens the "Connect & print" popup.
  const [printerPrompt, setPrinterPrompt] = useState(null);

  // Receipt descriptor for a just-paid water payment (thermal or default-printer).
  function waterReceiptDesc(j) {
    return {
      title: "WATER OFFICIAL RECEIPT",
      accountName: j.accountName,
      pnNo: j.pnNo,
      orNo: j.orNo,
      cashierName: user?.fullName || user?.employeeId || "",
      lines: [
        ["Meter", j.meter],
        ["Period", j.period],
        ...(j.discount > 0 ? [["Base charge", peso(j.baseAmount)], [j.discountReason || "Senior disc.", `-${peso(j.discount)}`]] : []),
        ["Amount due", peso(j.amountDue)],
        ["Received", peso(j.amountReceived)],
        ...(j.cbuExcess > 0 ? [["Excess->CBU", peso(j.cbuExcess)], ["New CBU bal", peso(j.newCbu)]] : []),
      ],
      total: j.amountDue,
      totalLabel: "PAID",
      note: "Bring this OR to the Water Bill Officer.",
    };
  }
  // Quick today's-collection summary fetched from /collections/today, and
  // recent customers (localStorage) so the cashier can re-open a stepped-
  // away walk-in with a single tap.
  const [todayStats, setTodayStats] = useState(null);
  const [recents, setRecents] = useState(() => loadRecents());
  const searchRef = useRef(null);
  // Map of productLoanId → ₱ amount to include on this OR. Reset
  // every time the Pay modal opens so a previous pick doesn't bleed
  // across receipts.
  const [productLoanPicks, setProductLoanPicks] = useState({});
  // Bundled additions on the same OR (zero by default; cashier opts in).
  const [paySavings, setPaySavings] = useState("");
  // Where any automatic excess (bill input > total due) routes.
  const [payExcessTo, setPayExcessTo] = useState("cbu");
  // Penalty days to CHARGE (default = full days overdue). Admin-gated: the
  // cashier can lower it (charge fewer days) or set 0 to waive entirely.
  const [penaltyDays, setPenaltyDays] = useState(0);

  const penaltyOf = (bill) => Number(bill?.penaltyApplied || 0);          // full penalty on the bill
  const daysOf = (bill) => Math.max(0, Math.floor(Number(bill?.daysOverdue || 0)));
  const baseOf = (bill) => Math.max(0, +(Number(bill?.totalDue || 0) - penaltyOf(bill)).toFixed(2)); // base, no penalty
  // Penalty amount for N days — mirrors the server's penaltyForDays().
  const penaltyForDays = (days) => {
    const s = data?.penaltySettings || { daily: 10, grace: 5, after: 200 };
    const d = Math.max(0, Math.floor(Number(days) || 0));
    if (d <= 0) return 0;
    if (d <= s.grace) return +(d * s.daily).toFixed(2);
    return +(s.grace * s.daily + s.after).toFixed(2);
  };
  const effectiveDue = (bill, days) => +(baseOf(bill) + penaltyForDays(days)).toFixed(2);

  function openPay(bill) {
    setPayTarget(bill);
    setPayOR("");
    setPenaltyDays(daysOf(bill)); // default to full penalty
    setPayReceived(String(bill.totalDue || ""));
    setPayCbu("");
    setPaySavings("");
    setPayExcessTo("cbu");
    setProductLoanPicks({});
  }
  // Change the charged penalty days + re-fill the bill amount.
  function setPenDays(days) {
    const d = Math.max(0, Math.min(Math.floor(Number(days) || 0), daysOf(payTarget)));
    setPenaltyDays(d);
    if (payTarget) setPayReceived(String(effectiveDue(payTarget, d)));
  }

  // Sum of the cashier's product-loan picks — added to the bill
  // portion to compute the total cash collected.
  const productLoanSum = Object.values(productLoanPicks).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );

  async function submitPay(e) {
    e?.preventDefault?.();
    if (!payTarget) return;
    const fullDays = daysOf(payTarget);
    const chosenDays = data?.cashierCanWaivePenalty ? Math.max(0, Math.min(penaltyDays, fullDays)) : fullDays;
    const reduced = data?.cashierCanWaivePenalty && chosenDays < fullDays && penaltyOf(payTarget) > 0;
    const due = effectiveDue(payTarget, chosenDays);
    const billPortion = Number(payReceived) || 0;
    const cbuPortion = Math.max(0, Number(payCbu) || 0);
    const savingsPortion = Math.max(0, Number(paySavings) || 0);
    if (savingsPortion > 0 && !data.savingsAccount) {
      return toast.error("Member has no savings account. Open one in the Savings tab first.");
    }
    // amountReceived now also includes any bundled product-loan picks +
    // direct CBU contribution + savings deposit. Server validates that
    // amountReceived >= sum(all bundled items) and uses the leftover
    // (if any) as an automatic CBU credit on top.
    const productLoanPayments = Object.entries(productLoanPicks)
      .map(([id, amount]) => ({ id, amount: Number(amount) || 0 }))
      .filter((p) => p.amount > 0);
    const totalReceived = billPortion + cbuPortion + savingsPortion + productLoanSum;
    if (!payOR.trim()) return toast.error("Enter the OR number.");
    if (billPortion < due) return toast.error(`Bill amount must be at least ₱${due.toFixed(2)}.`);
    if (reduced && !window.confirm(`Charge penalty for ${chosenDays} of ${fullDays} overdue day(s) = ₱${penaltyForDays(chosenDays).toFixed(2)}?\n₱${(penaltyOf(payTarget) - penaltyForDays(chosenDays)).toFixed(2)} will be waived. Member pays ₱${due.toFixed(2)} instead of ₱${Number(payTarget.totalDue).toFixed(2)}.`)) return;
    setPaying(true);
    const target = payTarget;
    const orNo = payOR.trim().toUpperCase();
    try {
      const res = await apiFetch("/cashier/pay-water", {
        method: "POST",
        token,
        body: {
          pnNo: data.member.pnNo,
          meterNumber: target.meterNumber,
          periodKey: target.periodKey || target.periodCovered,
          orNo,
          amountReceived: totalReceived,
          method: "cash",
          productLoanPayments,
          savingsDeposit: savingsPortion,
          cbuContribution: cbuPortion,
          excessTo: payExcessTo,
          penaltyDays: chosenDays,
        },
      });
      toast.success(res.message || "Payment posted.");
      setPayTarget(null);
      // Capture receipt info so we can show "just paid" + print OR.
      const j = {
        module: "water",
        orNo,
        period: target.periodCovered || target.periodKey,
        meter: target.meterNumber,
        amountDue: due,
        amountReceived: totalReceived,
        cbuExcess: res.cbuExcess || 0,
        newCbu: res.newCbuBalance || 0,
        baseAmount: Number(target.baseAmount) || 0,
        discount: Number(target.discount) || 0,
        discountReason: target.discountReason || "",
        accountName: data.member.accountName,
        pnNo: data.member.pnNo,
        at: new Date(),
      };
      setJustPaid(j);
      // Auto-print: thermal printer if ready, else the OS default printer.
      // Only pops the connect prompt if no printer AND fallback is disabled.
      const pr = await printReceiptSmart(waterReceiptDesc(j));
      if (pr.needConnect) setPrinterPrompt({ printFn: () => printPaymentReceipt(waterReceiptDesc(j)) });
      else if (pr.via === "thermal") toast.success("Receipt printed.");
      // Await the refresh so the bill flips to PAID in the same render pass.
      await lookup(null, data.member.pnNo);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setPaying(false);
    }
  }

  // Print the OR receipt on demand. Prefers the thermal printer (USB/BT — may
  // show the picker since it's a click); falls back to the OS default printer
  // (58mm receipt) when no thermal printer is available.
  async function printJustPaidReceipt() {
    if (!justPaid) return;
    const res = await printReceiptManual(waterReceiptDesc(justPaid));
    if (res.via === "thermal") toast.success("Receipt printed.");
  }

  // Focus the search box the moment the page opens so the cashier can
  // start typing as the customer walks up — no mouse needed.
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Fetch today's quick stats once on mount (and after every payment).
  useEffect(() => {
    apiFetch("/collections/today?module=water", { token })
      .then(setTodayStats)
      .catch(() => {/* non-blocking */});
  }, [token, justPaid]);

  // Debounced auto-search. Cashier just types — results appear when
  // they pause for ~400ms. No "Look up" button to chase.
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
      const res = await apiFetch(`/cashier/water?q=${encodeURIComponent(term)}`, { token });
      setData(res);
      // Push to "recent" only on a single-account match (skips the
      // candidate-list response from a name with multiple matches).
      if (res?.member?.pnNo) setRecents(pushRecent({ pnNo: res.member.pnNo, accountName: res.member.accountName, totalDue: res.totalDue }) || []);
    } catch (e2) {
      setErr(e2.message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  // Cashier picks which meter carries the senior/PWD discount (multi-meter
  // accounts). The server moves the discount to that meter + re-prices the
  // member's unpaid bills; we re-fetch to show the new amounts.
  async function setDiscountMeter(meterNumber) {
    if (!data?.member?.pnNo || !meterNumber || meterNumber === data.member.discountMeterNumber) return;
    setSettingMeter(true);
    try {
      const res = await apiFetch("/cashier/water/discount-meter", {
        method: "POST", token, body: { pnNo: data.member.pnNo, meterNumber },
      });
      toast.success(`Discount moved to meter ${res.discountMeter}.`);
      await lookup(null, data.member.pnNo);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setSettingMeter(false);
    }
  }

  function openRecent(r) {
    setQ(r.pnNo);
    lookup(null, r.pnNo);
    searchRef.current?.focus();
  }
  function clearRecents() {
    localStorage.removeItem(RECENT_KEY);
    setRecents([]);
  }

  function printSlip(filterMeter = null) {
    if (!data) return;
    const unpaid = (data.bills || []).filter((b) => b.status !== "paid" && (!filterMeter || String(b.meterNumber).toUpperCase() === String(filterMeter).toUpperCase()));
    const slipTotal = unpaid.reduce((s, b) => s + (Number(b.totalDue) || 0), 0);
    const rows = unpaid
      .map(
        (b) =>
          `<tr><td>${b.periodCovered || b.periodKey || ""}</td><td>${b.meterNumber || ""}</td><td>${b.status}</td><td style="text-align:right">${peso(b.totalDue)}</td></tr>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Dues Slip — ${data.member.pnNo}</title>
      <style>@page{size:A6;margin:8mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
      h1{font-size:14px;color:#0f766e;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
      table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}
      th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:left}
      .total{margin-top:8px;text-align:right;font-weight:bold;font-size:13px}
      .muted{color:#64748b;font-size:10px}.warn{color:#b91c1c;font-size:10px;margin-top:6px}
      </style></head><body>
      <h1>POWASSCO — Water Dues Slip${filterMeter ? ` (Meter ${filterMeter})` : ""}</h1>
      <div class="muted">Generated ${new Date().toLocaleString()} by ${user?.fullName || user?.employeeId || ""}</div>
      <div class="row"><span>Account No.:</span><b>${data.member.pnNo}</b></div>
      <div class="row"><span>Account:</span><b>${data.member.accountName}</b></div>
      <div class="row"><span>Address:</span><span>${data.member.address || "—"}</span></div>
      <table><thead><tr><th>Period</th><th>Meter</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#64748b">No outstanding dues</td></tr>`}</tbody></table>
      <div class="total">TOTAL DUE: ${peso(slipTotal)}</div>
      <div class="warn">Hand-write the OR number on the official paper receipt. Consumer must bring the OR to the Water Bill Officer to post the payment.</div>
      </body></html>`;
    printHtmlDoc(html);
  }

  return (
    <Card>
      {/* TODAY'S QUICK STATS — at-a-glance KPIs for the cashier.
           Reads from /collections/today, broken out into four
           categories so the cashier can reconcile the drawer at the
           end of the shift:
             Bills paid       = bill-portion of payments (cash + online)
             CBU collected    = extra cash pushed into Capital Build-Up
             Total cash       = drawer total (bills cash + CBU cash)
             Total CBU on file = system-wide CBU balance snapshot
             Outstanding bills = system-wide unsettled water receivable
             Grand today      = everything received in this module
        */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Receipts today" value={todayStats?.totals?.water?.count ?? "—"} icon={CheckCircle} tone="emerald" />
        <Kpi label="Bills paid today" value={peso(todayStats?.totals?.water?.billCollected ?? 0)} icon={ReceiptText} tone="blue" />
        <Kpi label="CBU collected today" value={peso(todayStats?.totals?.water?.cbu ?? 0)} icon={Wallet} tone="violet" />
        <Kpi label="Total cash in drawer" value={peso(todayStats?.totals?.water?.cash ?? 0)} icon={Wallet} tone="amber" />
        <Kpi label="Total CBU on file" value={peso(todayStats?.cbuOnFile?.total ?? 0)} icon={Banknote} tone="emerald" />
        <Kpi label="Outstanding bills" value={peso(todayStats?.outstanding?.water?.total ?? 0)} icon={ReceiptText} tone="red" />
      </div>
      {/* GRAND TOTAL strip — explicit sum of bill + CBU, emphasised. */}
      <div className="mt-2 rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Grand total today (Water)</div>
            <div className="text-[11px] text-emerald-800/70">
              Bills paid ₱{Number(todayStats?.totals?.water?.billCollected || 0).toFixed(2)} + CBU ₱{Number(todayStats?.totals?.water?.cbu || 0).toFixed(2)}
            </div>
          </div>
          <div className="font-mono text-2xl font-extrabold text-emerald-700">
            {peso((todayStats?.totals?.water?.cash || 0) + (todayStats?.totals?.water?.online || 0))}
          </div>
        </div>
      </div>

      {/* CBU LEDGER RECONCILIATION — visible cross-check with the
           bookkeeper's records. Net of credits − debits across the
           entire CbuTransaction history should equal the system-wide
           Σ member.cbuBalance. Any drift means a write got past the
           ledger (or vice versa) and the bookkeeper needs to look. */}
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

      {/* CENTERED SEARCH — primary action, auto-debounced (no button). */}
      <div className="mt-6 mx-auto max-w-2xl">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
            <Droplets size={18} className="text-emerald-600" /> Water Dues Lookup
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Just type — search is automatic. Account No., meter number, or account name.
          </div>
        </div>
        <div className="mt-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setData(null); setErr(""); } }}
            placeholder="AST123,  meter 0009876,  or  Juan Dela Cruz…"
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

        {/* RECENT — one-tap re-open of the last customers. */}
        {recents.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-1"><History size={12} /> Recent</span>
              <button onClick={clearRecents} className="text-slate-400 hover:text-slate-700">Clear</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r.pnNo}
                  onClick={() => openRecent(r)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200"
                >
                  <span className="font-mono">{r.pnNo}</span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate max-w-[160px]">{r.accountName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* Candidate list — shown when the name search matches >1 member. */}
      {data?.candidates && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Multiple matches ({data.candidates.length}) — pick the correct account
          </div>
          <div className="divide-y rounded-2xl border border-slate-200">
            {data.candidates.map((c) => (
              <button
                key={c.pnNo}
                onClick={() => { setQ(c.pnNo); lookup(null, c.pnNo); }}
                className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900">{c.accountName}</div>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono">{c.pnNo}</span>
                    {c.address ? <> • {c.address}</> : null}
                  </div>
                  {c.meters?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      {c.meters.map((mn) => (
                        <span key={mn} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{mn}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.accountStatus === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{c.accountStatus}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data && !data.candidates && (
        <div className="mt-5 space-y-4">
          {/* Member card */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-base font-bold text-slate-900">{data.member.accountName}</div>
                  {data.member.isSeniorCitizen && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                      <BadgeCheck size={12} /> Senior{data.member.seniorDiscountRate > 0 ? ` ${data.member.seniorDiscountRate}%` : ""}
                    </span>
                  )}
                  {data.member.hasPWD && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      <BadgeCheck size={12} /> PWD
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-500">{data.member.pnNo}</div>
                {data.member.address && (
                  <div className="mt-1 flex items-start gap-1 text-xs text-slate-600">
                    <MapPin size={12} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span>{data.member.address}</span>
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  Classification: <b className="text-slate-700">{data.member.classification || "—"}</b> • Status: <b className={data.member.accountStatus === "active" ? "text-emerald-700" : "text-red-600"}>{data.member.accountStatus}</b>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Total amount due</div>
                <div className="text-2xl font-extrabold text-red-600">{peso(data.totalDue)}</div>
                <div className="text-xs text-slate-500">{data.unpaidCount} unpaid bill(s)</div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <button onClick={() => openReceivables(data.member.pnNo)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                    <ReceiptText size={13} /> Account receivables
                  </button>
                  <button onClick={printSlip} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Printer size={13} /> Print dues slip
                  </button>
                </div>
              </div>
            </div>
            {data.member.meters?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {data.member.meters.map((m) => (
                  <span key={m.meterNumber} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono">
                    {m.meterNumber}{m.meterBrand ? ` • ${m.meterBrand}` : ""}
                    {(data.member.isSeniorCitizen || data.member.hasPWD) && m.isDiscountMeter && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-700"><BadgeCheck size={10} /> discount</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Senior/PWD discount meter — applies to ONE meter per account.
                Multi-meter: cashier picks which. Single-meter: that meter. */}
            {(data.member.isSeniorCitizen || data.member.hasPWD) && data.member.meters?.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs">
                <BadgeCheck size={14} className="text-violet-600" />
                <span className="font-semibold text-violet-800">Discount applies to meter:</span>
                <select
                  value={data.member.discountMeterNumber || ""}
                  disabled={settingMeter}
                  onChange={(e) => setDiscountMeter(e.target.value)}
                  className="rounded-lg border border-violet-300 bg-white px-2 py-1 font-mono text-xs disabled:opacity-50"
                >
                  {data.member.meters.map((m) => (
                    <option key={m.meterNumber} value={m.meterNumber}>{m.meterNumber}</option>
                  ))}
                </select>
                {settingMeter && <Loader2 size={13} className="animate-spin text-violet-600" />}
                <span className="text-[11px] text-violet-600">The {data.member.seniorDiscountRate || 5}% discount is given on this meter only.</span>
              </div>
            )}
            {(data.member.isSeniorCitizen || data.member.hasPWD) && data.member.meters?.length === 1 && (
              <div className="mt-3 text-[11px] text-violet-600">
                <BadgeCheck size={12} className="inline -mt-0.5" /> Senior/PWD discount applies to this account's meter automatically.
              </div>
            )}
          </div>

          {/* Pending online payments warning */}
          {data.pendingOnline?.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold"><Hourglass size={16}/> Online payment(s) still pending review</div>
              <ul className="mt-1 list-disc pl-6 text-xs">
                {data.pendingOnline.map((o) => (
                  <li key={o.referenceId}>Ref <b>{o.referenceId}</b> — {peso(o.amountToPay)} • meter {o.meterNumber} • {o.periodKey}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Confirm with the Water Bill Officer before accepting another payment to avoid duplicates.</p>
            </div>
          )}

          {/* Bills grouped per meter — so a multi-meter account shows each
              meter separately and the cashier can issue an OR against a
              specific meter. */}
          {/* Just-paid receipt banner — sticky until user dismisses or pays the next bill. */}
          {justPaid && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-emerald-800">✓ Payment posted — OR {justPaid.orNo}</div>
                  <div className="mt-0.5 text-xs text-emerald-700">
                    Meter {justPaid.meter} • {justPaid.period} • paid ₱{justPaid.amountDue.toFixed(2)}{justPaid.cbuExcess > 0 ? ` • excess ₱${justPaid.cbuExcess.toFixed(2)} → CBU (new balance ₱${justPaid.newCbu.toFixed(2)})` : ""}
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-600">
                    The Water Bill Officer will see this as paid on their next refresh.
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={printJustPaidReceipt} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Print OR receipt</button>
                  <button onClick={() => setJustPaid(null)} className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">Dismiss</button>
                </div>
              </div>
            </div>
          )}

          <MeterGroups data={data} printSlip={printSlip} onPay={isCashier ? openPay : null} justPaidPeriod={justPaid?.module === "water" && justPaid?.meter ? `${justPaid.meter}|${justPaid.period}` : null} />

          {data.recentPayments?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">Recent payments posted (last 20)</div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">OR No</th>
                      <th className="px-3 py-2">Meter</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Received By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr key={p._id} className="border-t">
                        <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(p.paidAt)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.orNo}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.meterNumber}</td>
                        <td className="px-3 py-2 text-right">{peso(p.amountPaid)}</td>
                        <td className="px-3 py-2 text-xs">{p.method || "cash"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{p.receivedBy || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account receivables — a reminder of everything the member still owes
          (water bills, product loans, cash loans), even items not yet due. */}
      <Modal open={!!receivables} title="Account Receivables" subtitle={receivables?.member ? `${receivables.member.accountName} • ${receivables.member.pnNo}` : ""} onClose={() => setReceivables(null)} size="lg">
        {receivables?.loading ? (
          <div className="py-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /> Loading…</div>
        ) : receivables && !receivables.hasAny ? (
          <div className="py-8 text-center">
            <CheckCircle className="mx-auto text-emerald-500" size={40} />
            <div className="mt-2 font-bold text-slate-800">All clear</div>
            <p className="mt-1 text-sm text-slate-500">No unpaid bills or unsettled balances for this account.</p>
          </div>
        ) : receivables ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3">
              <span className="text-sm font-semibold text-red-800">Total outstanding</span>
              <span className="font-mono text-2xl font-extrabold text-red-600">{peso(receivables.grandTotal)}</span>
            </div>

            {receivables.water.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800"><Droplets size={15} className="text-sky-500" /> Water bills <span className="text-slate-400">· {peso(receivables.totals.water)}</span></div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {receivables.water.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span><span className="font-mono">{b.periodKey}</span> <span className="text-slate-400">• {b.meterNumber}</span>{b.status === "overdue" && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">OVERDUE {b.daysOverdue}d</span>}</span>
                      <span className="font-mono font-bold">{peso(b.totalDue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receivables.productLoans.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800"><ReceiptText size={15} className="text-orange-500" /> Product loans / rentals <span className="text-slate-400">· {peso(receivables.totals.productLoans)}</span></div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {receivables.productLoans.map((p) => (
                    <div key={p._id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{p.productName} <span className="text-slate-400 capitalize">• {p.transactionType}</span>{p.overdue && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">OVERDUE</span>}{p.dueDate && !p.overdue && <span className="ml-2 text-[11px] text-slate-400">due {fmtDate(p.dueDate)}</span>}</span>
                      <span className="font-mono font-bold">{peso(p.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receivables.loans.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800"><Banknote size={15} className="text-emerald-500" /> Cash loans <span className="text-slate-400">· {peso(receivables.totals.loans)}</span></div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {receivables.loans.map((l) => (
                    <div key={l.loanId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-mono">{l.loanId} <span className="text-slate-400">• {peso(l.monthlyPayment)}/mo • matures {fmtDate(l.maturityDate)}</span></span>
                      <span className="font-mono font-bold">{peso(l.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receivables.reconnections?.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800"><AlertTriangle size={15} className="text-red-500" /> Reconnection fees <span className="text-slate-400">· {peso(receivables.totals.reconnection)}</span></div>
                <div className="rounded-xl border border-red-200 divide-y divide-red-100">
                  {receivables.reconnections.map((r) => (
                    <div key={r.meterNumber} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-mono">{r.meterNumber} <span className="text-red-500">• disconnected{r.disconnectedAt ? ` ${fmtDate(r.disconnectedAt)}` : ""}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-bold text-red-700">{peso(r.fee)}</span>
                        {isCashier && (
                          <button onClick={() => collectReconnection(receivables.member.pnNo, r.meterNumber, r.fee)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">Collect</button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Remind the member of these balances. Settle water bills + bundled product loans in the <b>Receive Payment</b> screen; cash loans under <b>Loan Dues</b>.
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button onClick={() => setReceivables(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Close</button>
        </div>
      </Modal>

      <Modal open={!!payTarget} title="Receive Payment" subtitle={payTarget ? `Meter ${payTarget.meterNumber} • ${payTarget.periodCovered || payTarget.periodKey}` : ""} onClose={() => setPayTarget(null)} size="lg">
        {payTarget && (
          <form onSubmit={submitPay} className="space-y-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              <div>Account: <b>{data?.member?.accountName}</b> <span className="text-xs text-slate-500">({data?.member?.pnNo})</span>
                {data?.member?.isSeniorCitizen && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 align-middle text-[10px] font-bold text-violet-700"><BadgeCheck size={10} /> Senior</span>}
                {data?.member?.hasPWD && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 align-middle text-[10px] font-bold text-sky-700"><BadgeCheck size={10} /> PWD</span>}
              </div>
              {Number(payTarget?.discount) > 0 && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Base {peso(payTarget.baseAmount || 0)} · {payTarget.discountReason || "Senior discount"}</span>
                  <span className="font-semibold text-violet-700">−{peso(payTarget.discount)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500">Total due</span>
                <span className="text-lg font-extrabold text-red-600">{peso(effectiveDue(payTarget, penaltyDays))}</span>
              </div>
              {/* Admin-gated penalty selector — charge for N of the overdue
                  days (0 = waive, full = the whole penalty). */}
              {data?.cashierCanWaivePenalty && penaltyOf(payTarget) > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold text-amber-800">
                    <span>Overdue {daysOf(payTarget)} day(s) · penalty <b>{peso(penaltyForDays(penaltyDays))}</b></span>
                    {penaltyDays < daysOf(payTarget) && <span className="rounded bg-amber-200 px-1.5 text-[10px] font-bold uppercase text-amber-800">−{peso(penaltyOf(payTarget) - penaltyForDays(penaltyDays))} waived</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-amber-700">Charge for</span>
                    <input type="range" min={0} max={daysOf(payTarget)} value={penaltyDays} onChange={(e) => setPenDays(e.target.value)} className="flex-1 accent-amber-600" />
                    <input type="number" min={0} max={daysOf(payTarget)} value={penaltyDays} onChange={(e) => setPenDays(e.target.value)} className="w-12 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-right text-xs font-mono" />
                    <span className="text-[10px] text-amber-700">day(s)</span>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" onClick={() => setPenDays(0)} className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">Waive all</button>
                    <button type="button" onClick={() => setPenDays(daysOf(payTarget))} className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">Full penalty</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">OR Number (paper receipt)</label>
              <input value={payOR} onChange={(e) => setPayOR(e.target.value.toUpperCase())} autoFocus placeholder="e.g. 0010234" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Amount for Bill (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  min={effectiveDue(payTarget, penaltyDays)}
                  value={payReceived}
                  onChange={(e) => setPayReceived(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-right"
                />
                <div className="mt-1 text-[10px] text-slate-500">Pre-filled to total due. Must be ≥ ₱{effectiveDue(payTarget, penaltyDays).toFixed(2)}.</div>
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
                <div className="mt-1 text-[10px] text-slate-500">Optional. Extra cash for Capital Build-Up.</div>
              </div>
            </div>

            {/* Bundled product-loan / rental balances. Picker shows
                every open product loan owned by this member; tick a
                row → its balance gets pre-filled (cashier can edit
                down for a partial). The OR receipt that comes out
                covers water + every ticked product loan in one go. */}
            {Array.isArray(data?.productLoans) && data.productLoans.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                <div className="text-[11px] font-bold uppercase tracking-widest text-violet-800 mb-2">
                  Include product-loan / rental balances on this OR
                </div>
                <div className="space-y-1.5">
                  {data.productLoans.map((pl) => {
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

            {/* Three-line breakdown so the cashier sees exactly how
                the money splits before posting. Top-line is the cash
                the member hands over; the indented rows show how much
                lands against the bill and how much is extracted to
                CBU. Updates live as the inputs change. */}
            {(() => {
              const billNum = Number(payReceived) || 0;
              const cbuNum = Math.max(0, Number(payCbu) || 0);
              const savingsNum = Math.max(0, Number(paySavings) || 0);
              const totalNum = billNum + cbuNum + savingsNum + productLoanSum;
              return (
                <>
                  {/* Bundle inputs — savings + direct CBU contribution.
                      Both are optional; default to zero. */}
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
                        disabled={!data.savingsAccount}
                        placeholder={data.savingsAccount ? "0.00" : "No savings account"}
                        className="mt-1 w-full rounded-xl border border-pink-200 bg-white px-3 py-2 text-sm font-mono disabled:opacity-50"
                      />
                      {data.savingsAccount ? (
                        <div className="mt-0.5 text-[10px] text-pink-700">
                          Balance on file: {peso(data.savingsAccount.balance || 0)}
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
                      <span className="text-xs text-slate-700">↳ Posted to bill</span>
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
                      <span className="text-xs text-violet-700">↳ Extracted to CBU</span>
                      <span className="font-mono text-sm font-bold text-violet-800">+{peso(cbuNum)}</span>
                    </div>
                    {billNum > effectiveDue(payTarget, penaltyDays) && (
                      <div className="mt-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-emerald-800">
                            Excess {peso(billNum - effectiveDue(payTarget, penaltyDays))} →
                          </span>
                          {[
                            ["cbu", "CBU"],
                            ["savings", "Savings"],
                            ["split", "Split 50/50"],
                          ].map(([k, label]) => (
                            <label key={k} className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${payExcessTo === k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"} ${k !== "cbu" && !data.savingsAccount ? "opacity-40 cursor-not-allowed" : ""}`}>
                              <input
                                type="radio"
                                name="excessTo"
                                value={k}
                                checked={payExcessTo === k}
                                disabled={k !== "cbu" && !data.savingsAccount}
                                onChange={() => setPayExcessTo(k)}
                                className="hidden"
                              />
                              {label}
                            </label>
                          ))}
                          {!data.savingsAccount && (
                            <span className="text-[10px] text-slate-400">(no savings account)</span>
                          )}
                        </div>
                      </div>
                    )}
                    {Number(payReceived) < effectiveDue(payTarget, penaltyDays) && (
                      <div className="mt-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-800">
                        Bill amount must be ≥ ₱{effectiveDue(payTarget, penaltyDays).toFixed(2)}.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button disabled={paying || Number(payReceived) < effectiveDue(payTarget, penaltyDays) || !payOR.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
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

function MeterGroups({ data, printSlip, onPay, justPaidPeriod }) {
  const groups = useMemo(() => {
    const map = new Map();
    // Seed with active meters from the member so meters with zero bills still appear.
    for (const m of data.member.meters || []) {
      map.set(String(m.meterNumber).toUpperCase(), { meterNumber: m.meterNumber, meterBrand: m.meterBrand, lastReading: m.lastReading, bills: [], unpaidTotal: 0, unpaidCount: 0 });
    }
    for (const b of data.bills || []) {
      const k = String(b.meterNumber || "").toUpperCase();
      if (!map.has(k)) map.set(k, { meterNumber: b.meterNumber, bills: [], unpaidTotal: 0, unpaidCount: 0 });
      const g = map.get(k);
      g.bills.push(b);
      if (b.status !== "paid") { g.unpaidTotal += Number(b.totalDue) || 0; g.unpaidCount += 1; }
    }
    return [...map.values()];
  }, [data]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Meters on this account ({groups.length})
      </div>
      {groups.map((g) => (
        <div key={g.meterNumber} className={`rounded-2xl border overflow-hidden ${g.unpaidCount > 0 ? "border-red-200" : "border-emerald-200"}`}>
          <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${g.unpaidCount > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
            <div className="flex items-center gap-2">
              <Gauge size={18} className={g.unpaidCount > 0 ? "text-red-600" : "text-emerald-600"} />
              <div>
                <div className="font-bold text-slate-900 font-mono">{g.meterNumber}</div>
                <div className="text-[11px] text-slate-500">{g.meterBrand || ""} {g.lastReading != null ? `• last reading ${g.lastReading}` : ""}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Owes</div>
                <div className={`text-lg font-extrabold ${g.unpaidCount > 0 ? "text-red-600" : "text-emerald-700"}`}>{peso(g.unpaidTotal)}</div>
                <div className="text-[11px] text-slate-500">{g.unpaidCount} unpaid bill(s)</div>
              </div>
              {g.unpaidCount > 0 && (
                <button onClick={() => printSlip(g.meterNumber)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Printer size={12}/> Slip for this meter
                </button>
              )}
            </div>
          </div>
          {g.bills.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">No bills on record yet for this meter.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Consumed</th>
                    <th className="px-3 py-2 text-right">Total Due</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2">Due Date</th>
                    <th className="px-3 py-2">OR No</th>
                    {onPay && <th className="px-3 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.bills.map((b) => {
                    const isJustPaid = justPaidPeriod && justPaidPeriod === `${b.meterNumber}|${b.periodCovered || b.periodKey}`;
                    return (
                    <tr key={b._id} className={`border-t ${isJustPaid ? "bg-emerald-100 animate-pulse" : b.status !== "paid" ? "bg-red-50/30" : ""}`}>
                      <td className="px-3 py-2 font-mono">{b.periodCovered || b.periodKey}</td>
                      <td className="px-3 py-2 text-xs">{Number(b.consumed || 0).toFixed(2)} m³</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-800">
                        {peso(b.totalDue)}
                        {Number(b.discount) > 0 && (
                          <span className="ml-1 inline-block rounded bg-violet-100 px-1 text-[9px] font-bold text-violet-700" title={b.discountReason || "Senior discount"}>−{peso(b.discount)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {b.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle size={10}/> PAID</span>
                        ) : b.status === "overdue" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertTriangle size={10}/> OVERDUE</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">UNPAID</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{fmtDate(b.dueDate)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{b.orNo || "—"}</td>
                      {onPay && (
                        <td className="px-3 py-2 text-right">
                          {b.status !== "paid" && (
                            <button
                              onClick={() => onPay(b)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 ring-1 ring-emerald-700/10"
                              title={`Receive payment for ${b.periodCovered || b.periodKey}`}
                            >
                              <Banknote size={16} /> Pay
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Single KPI tile for the top-of-page stats strip. Tone is the brand
// accent for that metric — emerald=count, amber=cash, blue=online,
// violet=combined.
export function Kpi({ label, value, icon: Icon, tone = "slate", big = false }) {
  const styles = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    red: "bg-red-50 border-red-200 text-red-800",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
  }[tone] || "bg-slate-50 border-slate-200 text-slate-800";
  return (
    <div className={`rounded-2xl border p-3 ${styles}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-70">
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className={`mt-1 font-extrabold ${big ? "text-2xl" : "text-xl"}`}>{value}</div>
    </div>
  );
}
