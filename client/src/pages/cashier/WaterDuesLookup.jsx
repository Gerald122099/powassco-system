import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Search, Droplets, Printer, AlertTriangle, MapPin, CheckCircle, Hourglass, Gauge, Banknote, History, Wallet, TrendingUp, ReceiptText } from "lucide-react";

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
  // Payment modal: { bill, totalDue }
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
  // Quick today's-collection summary fetched from /collections/today, and
  // recent customers (localStorage) so the cashier can re-open a stepped-
  // away walk-in with a single tap.
  const [todayStats, setTodayStats] = useState(null);
  const [recents, setRecents] = useState(() => loadRecents());
  const searchRef = useRef(null);

  function openPay(bill) {
    setPayTarget(bill);
    setPayOR("");
    setPayReceived(String(bill.totalDue || ""));
    setPayCbu("");
  }

  async function submitPay(e) {
    e?.preventDefault?.();
    if (!payTarget) return;
    const due = Number(payTarget.totalDue) || 0;
    const billPortion = Number(payReceived) || 0;
    const cbuPortion = Math.max(0, Number(payCbu) || 0);
    // amountReceived sent to the server is the COMBINED cash collected.
    // Anything beyond the bill portion is treated as CBU contribution
    // server-side via the existing excess-to-CBU path, so no API change
    // is needed — the UI just makes the split explicit.
    const totalReceived = billPortion + cbuPortion;
    if (!payOR.trim()) return toast.error("Enter the OR number.");
    if (billPortion < due) return toast.error(`Bill amount must be at least ₱${due.toFixed(2)}.`);
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
        },
      });
      toast.success(res.message || "Payment posted.");
      setPayTarget(null);
      // Capture receipt info so we can show "just paid" + print OR.
      setJustPaid({
        module: "water",
        orNo,
        period: target.periodCovered || target.periodKey,
        meter: target.meterNumber,
        amountDue: due,
        amountReceived: totalReceived,
        cbuExcess: res.cbuExcess || 0,
        newCbu: res.newCbuBalance || 0,
        accountName: data.member.accountName,
        pnNo: data.member.pnNo,
        at: new Date(),
      });
      // Await the refresh so the bill flips to PAID in the same render pass.
      await lookup(null, data.member.pnNo);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setPaying(false);
    }
  }

  // Print a small thermal-style OR receipt (works on any browser printer).
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
      <h1>POWASSCO — Official Receipt</h1>
      <div class="muted">OR ${j.orNo} • ${j.at.toLocaleString()} • by ${user?.fullName || user?.employeeId || ""}</div>
      <div class="line"></div>
      <div class="row"><span>Account</span><b>${j.accountName} (${j.pnNo})</b></div>
      <div class="row"><span>Meter / Period</span><span>${j.meter} • ${j.period}</span></div>
      <div class="line"></div>
      <div class="row"><span>Amount due</span><span>₱${j.amountDue.toFixed(2)}</span></div>
      <div class="row"><span>Amount received</span><b>₱${j.amountReceived.toFixed(2)}</b></div>
      ${j.cbuExcess > 0 ? `<div class="row"><span>Excess → CBU</span><b class="ok">₱${j.cbuExcess.toFixed(2)}</b></div><div class="row"><span class="muted">New CBU balance</span><span class="muted">₱${j.newCbu.toFixed(2)}</span></div>` : ""}
      <div class="line"></div>
      <div class="total">PAID ₱${j.amountDue.toFixed(2)}</div>
      <div class="muted" style="margin-top:8px">Bring this OR to the Water Bill Officer for filing. Keep your stub.</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
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
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) return alert("Allow pop-ups to print.");
    const unpaid = (data.bills || []).filter((b) => b.status !== "paid" && (!filterMeter || String(b.meterNumber).toUpperCase() === String(filterMeter).toUpperCase()));
    const slipTotal = unpaid.reduce((s, b) => s + (Number(b.totalDue) || 0), 0);
    const rows = unpaid
      .map(
        (b) =>
          `<tr><td>${b.periodCovered || b.periodKey || ""}</td><td>${b.meterNumber || ""}</td><td>${b.status}</td><td style="text-align:right">${peso(b.totalDue)}</td></tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Dues Slip — ${data.member.pnNo}</title>
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
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
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
                <div className="text-base font-bold text-slate-900">{data.member.accountName}</div>
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
                <button onClick={printSlip} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Printer size={13} /> Print dues slip
                </button>
              </div>
            </div>
            {data.member.meters?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {data.member.meters.map((m) => (
                  <span key={m.meterNumber} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono">
                    {m.meterNumber}{m.meterBrand ? ` • ${m.meterBrand}` : ""}
                  </span>
                ))}
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

      <Modal open={!!payTarget} title="Receive Payment" subtitle={payTarget ? `Meter ${payTarget.meterNumber} • ${payTarget.periodCovered || payTarget.periodKey}` : ""} onClose={() => setPayTarget(null)} size="sm">
        {payTarget && (
          <form onSubmit={submitPay} className="space-y-3">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
              <div>Account: <b>{data?.member?.accountName}</b> <span className="text-xs text-slate-500">({data?.member?.pnNo})</span></div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500">Total due</span>
                <span className="text-lg font-extrabold text-red-600">{peso(payTarget.totalDue)}</span>
              </div>
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
                  min={payTarget.totalDue}
                  value={payReceived}
                  onChange={(e) => setPayReceived(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-right"
                />
                <div className="mt-1 text-[10px] text-slate-500">Pre-filled to total due. Must be ≥ ₱{Number(payTarget.totalDue).toFixed(2)}.</div>
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
            {/* Three-line breakdown so the cashier sees exactly how
                the money splits before posting. Top-line is the cash
                the member hands over; the indented rows show how much
                lands against the bill and how much is extracted to
                CBU. Updates live as the inputs change. */}
            {(() => {
              const billNum = Number(payReceived) || 0;
              const cbuNum = Math.max(0, Number(payCbu) || 0);
              const totalNum = billNum + cbuNum;
              return (
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 space-y-1.5">
                  <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">Amount received from member</span>
                    <span className="font-mono text-xl font-extrabold text-emerald-900">{peso(totalNum)}</span>
                  </div>
                  <div className="flex items-center justify-between pl-3">
                    <span className="text-xs text-slate-700">↳ Posted to bill</span>
                    <span className="font-mono text-sm font-bold text-slate-800">{peso(billNum)}</span>
                  </div>
                  <div className={`flex items-center justify-between pl-3 ${cbuNum > 0 ? "" : "opacity-50"}`}>
                    <span className="text-xs text-violet-700">↳ Extracted to CBU</span>
                    <span className="font-mono text-sm font-bold text-violet-800">+{peso(cbuNum)}</span>
                  </div>
                  {Number(payReceived) < Number(payTarget.totalDue) && (
                    <div className="mt-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-800">
                      Bill amount must be ≥ ₱{Number(payTarget.totalDue).toFixed(2)}.
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
              <button disabled={paying || Number(payReceived) < Number(payTarget.totalDue) || !payOR.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {paying ? "Posting…" : "Post Payment"}
              </button>
            </div>
          </form>
        )}
      </Modal>
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
                      <td className="px-3 py-2 text-right font-bold text-slate-800">{peso(b.totalDue)}</td>
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
