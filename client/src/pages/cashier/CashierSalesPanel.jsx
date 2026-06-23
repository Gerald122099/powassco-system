// Cashier "Sales" — direct product sales paid in full at the counter.
// Supports both members (linked to account / pnNo) and walk-ins
// (customerName + optional contact). The server already exposes
// POST /bookkeeper/product-applications with transactionType="sale";
// this panel is the streamlined UI for the counter, separate from
// the bookkeeper's full catalog/loan-management screen.
//
// Out of scope here: loans (use bookkeeper) and rentals (use
// bookkeeper) — those need additional setup. Quick OTC sale only.

import { useEffect, useState, useCallback, useRef } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import PrinterPrompt from "../../components/PrinterPrompt";
import { printPaymentReceipt } from "../../lib/thermalPrint";
import { printReceiptSmart, printReceiptManual } from "../../lib/printerSettings";
import {
  ShoppingBag, Plus, Minus, Trash2, Search, User, UserPlus, Receipt, RefreshCw, Printer,
} from "lucide-react";

const peso = (n) =>
  "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];

// Receipt descriptor for a sale (thermal or default-printer).
function saleReceiptDesc(sale, cashierName) {
  // Members carry pnNo + accountName; only true walk-ins use customerName.
  const customer = sale.pnNo
    ? `${sale.accountName || "Member"} (${sale.pnNo})`
    : (sale.customerName || "Walk-in");
  // Cash (paid-now) items + loan (on-credit) items. Legacy single-item falls back.
  const cashItems = sale.cashItems || sale.items || (sale.productName ? [{ productName: sale.productName, quantity: sale.quantity || 1, unitPrice: sale.unitPrice, total: Number(sale.principal) || 0 }] : []);
  const loanItems = sale.loanItems || [];
  const lines = [];
  for (const it of cashItems) {
    lines.push([String(it.productName || "Product").slice(0, 18), `${it.quantity} × ${peso(it.unitPrice)}`]);
    lines.push(["", peso(it.total)]);
  }
  // Split tender breakdown.
  if (Number(sale.savingsAmount) > 0) {
    lines.push(["Cash", peso(sale.cashAmount)]);
    lines.push(["Savings", peso(sale.savingsAmount)]);
  }
  // On-credit (product loan) items — receivable, not paid on this OR.
  if (loanItems.length) {
    lines.push(["— ON CREDIT (LOAN) —", ""]);
    for (const it of loanItems) {
      lines.push([String(it.productName || "Product").slice(0, 18), `${it.quantity} × ${peso(it.unitPrice)}`]);
      lines.push(["", peso(it.total)]);
    }
    lines.push(["Loan balance", peso(sale.loanTotal)]);
  }
  // Overpayment routed to the member's account.
  if (sale.excess && Number(sale.excess.amount) > 0) {
    lines.push([`Excess -> ${sale.excess.to === "savings" ? "Savings" : "CBU"}`, peso(sale.excess.amount)]);
  }
  return {
    title: "SALES OR",
    accountName: customer,
    orNo: sale.orNo,
    cashierName,
    lines,
    total: Number(sale.cashTotal ?? sale.principal) || 0,
    totalLabel: loanItems.length ? "PAID (CASH)" : "PAID",
    note: loanItems.length ? "Product loan posted to your account — please settle by the due date." : "Thank you for your purchase!",
  };
}

export default function CashierSalesPanel() {
  const { token, user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [busy, setBusy] = useState(false);

  // New-sale modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("member"); // "member" | "walkin"
  const [memberQ, setMemberQ] = useState("");
  const [member, setMember] = useState(null);
  const [memberLookup, setMemberLookup] = useState({ status: "idle", error: "" });
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [cart, setCart] = useState([]); // [{ productId, name, unitPrice, qty, stock }]
  const [pickId, setPickId] = useState("");
  const [pickQty, setPickQty] = useState(1);
  const [orNo, setOrNo] = useState("");
  const [savingsUsed, setSavingsUsed] = useState(""); // ₱ from savings toward the cash portion
  const [cashReceived, setCashReceived] = useState(""); // cash tendered ("" = exact)
  const [saleExcessTo, setSaleExcessTo] = useState("cbu"); // where overpayment goes
  const [savingsBal, setSavingsBal] = useState(null); // member's savings balance (null = none/unknown)
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [printerPrompt, setPrinterPrompt] = useState(null);
  const cashierName = user?.fullName || user?.employeeId || "";

  const memberSearchRef = useRef(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [cat, apps] = await Promise.all([
        apiFetch("/bookkeeper/product-catalog", { token }),
        apiFetch("/bookkeeper/product-applications?type=sale", { token }),
      ]);
      setCatalog((cat || []).filter((p) => p.isActive !== false));
      // Recent sales — last 20 from the apps feed.
      setRecentSales((apps || []).filter((a) => a.transactionType === "sale").slice(0, 20));
    } catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["payments"], load);

  function resetForm() {
    setMode("member");
    setMemberQ("");
    setMember(null);
    setMemberLookup({ status: "idle", error: "" });
    setCustomerName("");
    setCustomerContact("");
    setCart([]);
    setPickId("");
    setPickQty(1);
    setOrNo("");
    setSavingsUsed("");
    setCashReceived("");
    setSaleExcessTo("cbu");
    setRemarks("");
    setLastSale(null);
  }
  function openNew() {
    resetForm();
    setOpen(true);
    setTimeout(() => memberSearchRef.current?.focus(), 50);
  }

  // Debounced member lookup by account number OR name.
  useEffect(() => {
    if (mode !== "member" || !open) return;
    const q = memberQ.trim();
    if (!q) { setMember(null); setMemberLookup({ status: "idle", error: "" }); return; }
    setMemberLookup({ status: "loading", error: "" });
    const t = setTimeout(async () => {
      try {
        // First try by exact pn
        try {
          const m = await apiFetch(`/water/members/pn/${encodeURIComponent(q.toUpperCase())}`, { token });
          if (m && m.pnNo) {
            setMember(m);
            setMemberLookup({ status: "found", error: "" });
            return;
          }
        } catch {/* fall through to name search */}
        // Name search via the cashier water endpoint. Single match →
        // { member } (full payload); several name matches →
        // { candidates: [...] }. There is no `members` key.
        const res = await apiFetch(`/cashier/water?q=${encodeURIComponent(q)}`, { token });
        if (res?.member) {
          setMember(res.member);
          setMemberLookup({ status: "found", error: "" });
        } else if (res?.candidates?.length) {
          setMember(null);
          setMemberLookup({ status: "ambiguous", error: `${res.candidates.length} matches — type the full account number (e.g. ${res.candidates[0].pnNo}).` });
        } else {
          setMember(null);
          setMemberLookup({ status: "missing", error: "Not found." });
        }
      } catch (e) {
        setMember(null);
        setMemberLookup({ status: "missing", error: e.message || "Not found" });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [memberQ, mode, open, token]);

  // Load the member's savings balance so "Pay with savings" can be offered.
  useEffect(() => {
    const pn = mode === "member" && member?.pnNo ? member.pnNo : "";
    if (!pn) { setSavingsBal(null); return; }
    let alive = true;
    apiFetch(`/savings/${encodeURIComponent(pn)}`, { token })
      .then((r) => { if (alive) setSavingsBal(r?.account?.status === "active" ? Number(r.account.balance) || 0 : null); })
      .catch(() => { if (alive) setSavingsBal(null); }); // no account / no access
    return () => { alive = false; };
  }, [mode, member, token]);

  // Cash vs loan split. Loan lines become product-loan receivables; cash
  // lines are paid now (cash and/or savings).
  const cashTotal = +cart.filter((l) => l.mode !== "loan").reduce((s, l) => s + l.unitPrice * l.qty, 0).toFixed(2);
  const loanTotal = +cart.filter((l) => l.mode === "loan").reduce((s, l) => s + l.unitPrice * l.qty, 0).toFixed(2);
  const total = +(cashTotal + loanTotal).toFixed(2);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const hasLoan = loanTotal > 0;
  // Savings can cover up to the CASH portion (and the member's balance).
  const savingsMax = +Math.min(Number(savingsBal) || 0, cashTotal).toFixed(2);
  const savingsUsedNum = +Math.min(Math.max(0, Number(savingsUsed) || 0), savingsMax).toFixed(2);
  const cashDue = +Math.max(0, cashTotal - savingsUsedNum).toFixed(2);
  // Cash tendered + overpayment routing (member only).
  const cashReceivedNum = cashReceived === "" ? cashDue : +Math.max(0, Number(cashReceived) || 0).toFixed(2);
  const saleExcess = +Math.max(0, cashReceivedNum - cashDue).toFixed(2);
  // Clamp savings if the cash portion shrinks below the entered amount.
  useEffect(() => { if ((Number(savingsUsed) || 0) > savingsMax) setSavingsUsed(savingsMax > 0 ? String(savingsMax) : ""); /* eslint-disable-next-line */ }, [savingsMax]);
  // Walk-ins can't loan — force every line to cash + clear savings.
  useEffect(() => { if (mode === "walkin") { setCart((prev) => prev.map((l) => ({ ...l, mode: "cash" }))); setSavingsUsed(""); } /* eslint-disable-next-line */ }, [mode]);

  // ── Cart actions ──
  function addToCart() {
    const p = catalog.find((x) => x._id === pickId);
    if (!p) { toast.error("Pick a product to add."); return; }
    const qty = Math.max(1, Math.floor(Number(pickQty) || 1));
    setCart((prev) => {
      const i = prev.findIndex((l) => l.productId === p._id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [...prev, { productId: p._id, name: p.name, unitPrice: Number(p.unitPrice) || 0, qty, stock: p.stock, category: p.category, mode: "cash" }];
    });
    setPickId(""); setPickQty(1);
  }
  function setLineQty(productId, qty) {
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: q } : l)));
  }
  function setLineMode(productId, m) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, mode: m } : l)));
  }
  function removeLine(productId) { setCart((prev) => prev.filter((l) => l.productId !== productId)); }

  async function submit() {
    if (cart.length === 0) { toast.error("Add at least one product to the cart."); return; }
    if (mode === "member" && !member) { toast.error("Pick a member or switch to Walk-in."); return; }
    if (mode === "walkin" && !customerName.trim()) { toast.error("Enter the walk-in customer name."); return; }
    if (hasLoan && mode !== "member") { toast.error("Product loans require a member — switch to Member."); return; }
    if (cashTotal > 0 && !orNo.trim()) { toast.error("Enter the OR number for the cash portion."); return; }
    setSubmitting(true);
    const saleOr = orNo.trim().toUpperCase();
    try {
      const body = {
        items: cart.map((l) => ({ productId: l.productId, quantity: l.qty, mode: l.mode === "loan" ? "loan" : "cash" })),
        orNo: saleOr,
        savingsAmount: savingsUsedNum,
        cashReceived: cashReceivedNum,
        excessTo: saleExcessTo,
        remarks: remarks.trim(),
      };
      if (mode === "member") {
        body.pnNo = member.pnNo;
      } else {
        body.customerName = customerName.trim();
        body.customerContact = customerContact.trim();
      }
      const res = await apiFetch("/cashier/sale-cart", { method: "POST", token, body });
      // Capture for the receipt + show the success state in the modal.
      const sale = {
        orNo: saleOr,
        cashTotal: res.cashTotal ?? cashTotal,
        cashAmount: res.cashAmount ?? cashDue,
        savingsAmount: res.savingsAmount ?? savingsUsedNum,
        loanTotal: res.loanTotal ?? loanTotal,
        excess: res.excess || (saleExcess > 0 ? { to: saleExcessTo, amount: saleExcess } : null),
        cashReceived: res.cashReceived ?? cashReceivedNum,
        principal: res.grandTotal ?? total,
        cashItems: res.cashItems || cart.filter((l) => l.mode !== "loan").map((l) => ({ productName: l.name, quantity: l.qty, unitPrice: l.unitPrice, total: l.unitPrice * l.qty })),
        loanItems: res.loanItems || cart.filter((l) => l.mode === "loan").map((l) => ({ productName: l.name, quantity: l.qty, unitPrice: l.unitPrice, total: l.unitPrice * l.qty })),
        pnNo: mode === "member" ? member?.pnNo : "",
        accountName: mode === "member" ? member?.accountName : "",
        customerName: mode === "walkin" ? customerName.trim() : "",
      };
      setLastSale(sale);
      toast.success(loanTotal > 0 ? `Posted • cash ${peso(res.cashTotal ?? cashTotal)} + loan ${peso(res.loanTotal ?? loanTotal)}` : `Sale posted • OR ${saleOr}`);
      // Auto-print: thermal printer if ready, else the OS default printer.
      const pr = await printReceiptSmart(saleReceiptDesc(sale, cashierName));
      if (pr.needConnect) setPrinterPrompt({ printFn: () => printPaymentReceipt(saleReceiptDesc(sale, cashierName)) });
      else if (pr.via === "thermal") toast.success("Receipt printed.");
      load(); // refresh recent list
    } catch (e) {
      toast.error(e.message || "Failed to post sale.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ShoppingBag size={20} className="text-orange-600" /> Sales
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Direct sales at the counter. Member sales link to their account; walk-ins capture name + contact only.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
          >
            <Plus size={16} /> New Sale
          </button>
        </div>
      </div>

      {/* Receive a payment on an existing product loan / rental */}
      <ProductLoanPaySection token={token} />

      {/* Recent sales */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">Recent sales</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">OR</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Method</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-500">No sales yet today.</td></tr>
              ) : recentSales.map((s) => (
                <tr key={s._id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{s.orNo || s.payments?.[0]?.orNo || "—"}</td>
                  <td className="px-3 py-2 text-xs">{new Date(s.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2">
                    {s.accountName || s.customerName || "—"}
                    {s.pnNo && <div className="text-[10px] font-mono text-slate-500">{s.pnNo}</div>}
                    {!s.pnNo && s.customerContact && <div className="text-[10px] text-slate-500">{s.customerContact}</div>}
                  </td>
                  <td className="px-3 py-2">{s.productName || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.quantity || 1}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{peso(s.principal)}</td>
                  <td className="px-3 py-2 text-xs">{s.payments?.[0]?.method || "cash"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} title="New Sale" onClose={() => setOpen(false)} size="lg">
        {lastSale ? (
          // Success view — confirms posting and offers the Print button.
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <Receipt size={18} /> Sale posted
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">OR No.</span> <span className="font-mono font-bold">{lastSale.orNo || "—"}</span></div>
                <div><span className="text-slate-500">Cash paid</span> <span className="font-bold text-emerald-700">{peso(lastSale.cashTotal)}</span>{Number(lastSale.savingsAmount) > 0 ? <span className="text-[11px] text-slate-500"> (cash {peso(lastSale.cashAmount)} + savings {peso(lastSale.savingsAmount)})</span> : null}</div>
                {(lastSale.cashItems || []).length > 0 && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Cash items</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {lastSale.cashItems.map((it, i) => (
                        <li key={i} className="flex justify-between font-mono text-xs"><span className="truncate">{it.productName} × {it.quantity}</span><span>{peso(it.total)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(lastSale.loanItems || []).length > 0 && (
                  <div className="col-span-2 rounded-lg bg-indigo-50 px-2 py-1.5">
                    <span className="text-indigo-700 font-semibold">On credit (product loan) — {peso(lastSale.loanTotal)}</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {lastSale.loanItems.map((it, i) => (
                        <li key={i} className="flex justify-between font-mono text-xs text-indigo-800"><span className="truncate">{it.productName} × {it.quantity}{it.dueDate ? ` · due ${new Date(it.dueDate).toLocaleDateString()}` : ""}</span><span>{peso(it.total)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {lastSale.excess && Number(lastSale.excess.amount) > 0 && (
                  <div className="col-span-2 text-emerald-700">
                    <span className="text-slate-500">Excess</span> {peso(lastSale.excess.amount)} → <b>{lastSale.excess.to === "savings" ? "Savings" : "CBU"}</b>
                    {lastSale.excess.newBalance != null ? ` (new balance ${peso(lastSale.excess.newBalance)})` : ""}
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-slate-500">Customer</span> {mode === "member" ? `${member?.accountName} (${member?.pnNo})` : `${customerName} (walk-in)`}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={async () => {
                  const res = await printReceiptManual(saleReceiptDesc(lastSale, cashierName));
                  if (res.via === "thermal") toast.success("Receipt printed.");
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                <Printer size={14} /> Print OR
              </button>
              <button
                onClick={() => { resetForm(); setLastSale(null); }}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
              >
                <Plus size={14} /> Another sale
              </button>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Customer mode toggle */}
            <div className="inline-flex rounded-xl border border-slate-200 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode("member")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${mode === "member" ? "bg-orange-600 text-white" : "text-slate-700"}`}
              >
                <User size={14} /> Member
              </button>
              <button
                type="button"
                onClick={() => setMode("walkin")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${mode === "walkin" ? "bg-orange-600 text-white" : "text-slate-700"}`}
              >
                <UserPlus size={14} /> Walk-in
              </button>
            </div>

            {/* Customer fields */}
            {mode === "member" ? (
              <div>
                <label className="text-xs font-semibold text-slate-600">Account number or name</label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    ref={memberSearchRef}
                    value={memberQ}
                    onChange={(e) => setMemberQ(e.target.value)}
                    placeholder="e.g. ABC123 or Dela Cruz"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm"
                  />
                </div>
                {memberLookup.status === "loading" && (
                  <div className="mt-1 text-xs text-slate-500">Looking up…</div>
                )}
                {memberLookup.status === "found" && member && (
                  <div className="mt-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    ✓ <b>{member.accountName}</b> ({member.pnNo}) • CBU {peso(member.cbuBalance || 0)}
                  </div>
                )}
                {(memberLookup.status === "missing" || memberLookup.status === "ambiguous") && (
                  <div className="mt-1 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{memberLookup.error}</div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Customer name *</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Maria Santos"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Contact (optional)</label>
                  <input
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder="phone / address"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Add-to-cart row */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div>
                <label className="text-xs font-semibold text-slate-600">Product</label>
                <select
                  value={pickId}
                  onChange={(e) => setPickId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  <option value="">— pick a product —</option>
                  {catalog.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} — {peso(p.unitPrice)} {p.category ? `(${p.category})` : ""}
                      {p.stock > 0 ? ` • stock ${p.stock}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="text-xs font-semibold text-slate-600">Qty</label>
                <input
                  type="number" min="1" value={pickQty}
                  onChange={(e) => setPickQty(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } }}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                />
              </div>
              <button
                type="button" onClick={addToCart} disabled={!pickId}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                <Plus size={15} /> Add
              </button>
            </div>

            {/* Cart */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              {cart.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">Cart is empty — add products above.</div>
              ) : cart.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{l.name}</div>
                    <div className="text-[11px] text-slate-500">{peso(l.unitPrice)} each{l.stock > 0 ? ` • stock ${l.stock}` : ""}</div>
                    {mode === "member" && (
                      <div className="mt-1 inline-flex rounded-lg border border-slate-200 p-0.5 text-[10px] font-bold">
                        <button type="button" onClick={() => setLineMode(l.productId, "cash")} className={`rounded px-2 py-0.5 ${l.mode !== "loan" ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Cash</button>
                        <button type="button" onClick={() => setLineMode(l.productId, "loan")} className={`rounded px-2 py-0.5 ${l.mode === "loan" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Loan</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setLineQty(l.productId, l.qty - 1)} disabled={l.qty <= 1} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Minus size={13} /></button>
                    <input
                      type="number" min="1" value={l.qty}
                      onChange={(e) => setLineQty(l.productId, e.target.value)}
                      className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-sm font-mono"
                    />
                    <button type="button" onClick={() => setLineQty(l.productId, l.qty + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Plus size={13} /></button>
                  </div>
                  <div className="w-24 text-right font-mono text-sm font-bold text-slate-800">{peso(l.unitPrice * l.qty)}</div>
                  <button type="button" onClick={() => removeLine(l.productId)} className="grid h-7 w-7 place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            {/* OR + split payment + remarks */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">OR number {cashTotal > 0 ? "*" : "(cash portion only)"}</label>
                <input
                  value={orNo}
                  onChange={(e) => setOrNo(e.target.value)}
                  disabled={cashTotal <= 0}
                  placeholder={cashTotal > 0 ? "from receipt booklet" : "— no cash portion —"}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Pay from savings (₱)</label>
                <input
                  type="number" min="0" step="0.01" max={savingsMax}
                  value={savingsUsed}
                  onChange={(e) => setSavingsUsed(e.target.value)}
                  disabled={mode !== "member" || savingsBal == null || cashTotal <= 0}
                  placeholder={savingsBal == null ? "no savings account" : "0.00"}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
                {mode === "member" && savingsBal != null && (
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <button type="button" onClick={() => setSavingsUsed(savingsMax > 0 ? String(savingsMax) : "")} className="font-semibold text-pink-700 hover:underline">Use max (₱{savingsMax.toLocaleString(undefined, { minimumFractionDigits: 2 })})</button>
                    <span className="text-slate-500">Bal ₱{Number(savingsBal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Remarks (optional)</label>
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. delivery to Owak"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            {/* Totals — cash (paid now, split into cash + savings) and loan
                (posted to the member's account as a product-loan receivable). */}
            <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm text-orange-900">
                <span>Cash to pay now</span>
                <span className="font-mono font-bold">{peso(cashTotal)}</span>
              </div>
              {savingsUsedNum > 0 && (
                <div className="flex items-center justify-between text-[12px] text-orange-700">
                  <span className="pl-3">↳ cash {peso(cashDue)} + savings {peso(savingsUsedNum)}</span>
                  <span />
                </div>
              )}
              {loanTotal > 0 && (
                <div className="flex items-center justify-between text-sm text-indigo-800">
                  <span>On credit (product loan)</span>
                  <span className="font-mono font-bold">{peso(loanTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-orange-200 pt-1.5">
                <span className="text-sm font-semibold text-slate-700">{cartCount} unit{cartCount === 1 ? "" : "s"} • total</span>
                <span className="text-xl font-extrabold text-orange-700 font-mono">{peso(total)}</span>
              </div>
            </div>

            {/* Cash tendered + overpayment routing (member only). */}
            {mode === "member" && cashDue > 0 && (
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-[150px] flex-1">
                    <label className="text-xs font-semibold text-slate-600">Cash tendered (₱)</label>
                    <input type="number" min={cashDue} step="0.01" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder={cashDue.toFixed(2)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
                    <div className="mt-0.5 text-[10px] text-slate-500">Cash due {peso(cashDue)} — leave blank for exact.</div>
                  </div>
                  {saleExcess > 0 && (
                    <div className="min-w-[190px] flex-1">
                      <div className="text-xs font-semibold text-emerald-700">Change / excess {peso(saleExcess)} → keep in</div>
                      <div className="mt-1 flex gap-2">
                        {[{ k: "cbu", label: "CBU" }, { k: "savings", label: "Savings" }].map((o) => (
                          <label key={o.k} className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${saleExcessTo === o.k ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"} ${o.k === "savings" && savingsBal == null ? "opacity-40 cursor-not-allowed" : ""}`}>
                            <input type="radio" name="saleExcessTo" className="hidden" checked={saleExcessTo === o.k} disabled={o.k === "savings" && savingsBal == null} onChange={() => setSaleExcessTo(o.k)} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">Cashier chooses — not automatic.</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || cart.length === 0 || total <= 0 || (cashTotal > 0 && !orNo.trim()) || (mode === "member" && !member) || (mode === "walkin" && !customerName.trim()) || (hasLoan && mode !== "member")}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <Receipt size={14} /> {submitting ? "Posting…" : (loanTotal > 0 ? `Post — cash ${peso(cashTotal)} + loan ${peso(loanTotal)}` : `Post Sale ${peso(total)}`)}
              </button>
            </div>
          </div>
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

// ─── Pay Product Loan ───────────────────────────────────────────────
// Standalone payment against an existing product loan / rental — for
// members who come in JUST to pay their product balance (no water or
// loan bill on the same visit; those flows have their own bundling
// pickers). Search the member, pick the open item, enter OR + amount.
function ProductLoanPaySection({ token }) {
  const [q, setQ] = useState("");
  const [member, setMember] = useState(null);
  const [loans, setLoans] = useState([]);
  const [lookupErr, setLookupErr] = useState("");
  const [target, setTarget] = useState(null);
  const [payOr, setPayOr] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [posting, setPosting] = useState(false);
  // Monotonic search id — stale responses (slow earlier keystrokes)
  // are ignored so the result can't flicker back to a previous member.
  const searchSeq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setMember(null); setLoans([]); setLookupErr(""); return; }
    const mySeq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/cashier/water?q=${encodeURIComponent(text)}`, { token });
        if (mySeq !== searchSeq.current) return; // stale — a newer search ran
        if (res?.member) {
          setMember(res.member);
          setLoans(res.productLoans || []);
          setLookupErr((res.productLoans || []).length ? "" : "No open product loans / rentals on this account.");
        } else if (res?.candidates?.length) {
          setMember(null); setLoans([]);
          setLookupErr(`${res.candidates.length} matches — type the full account number (e.g. ${res.candidates[0].pnNo}).`);
        }
      } catch (e) {
        if (mySeq !== searchSeq.current) return;
        setMember(null); setLoans([]);
        setLookupErr(e.message || "Not found.");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, token]);

  function openPay(pl) {
    setTarget(pl);
    setPayOr("");
    setPayAmount(String(pl.balance || ""));
    setPayMethod("cash");
  }

  async function post() {
    if (!target) return;
    if (!payOr.trim()) { toast.error("Enter the OR number."); return; }
    const amt = Number(payAmount);
    if (!(amt > 0)) { toast.error("Enter an amount greater than 0."); return; }
    setPosting(true);
    try {
      const res = await apiFetch(`/bookkeeper/product-applications/${target._id}/pay`, {
        method: "POST",
        token,
        body: { orNo: payOr.trim().toUpperCase(), amount: amt, method: payMethod },
      });
      toast.success(`Posted ₱${res.applied} on ${target.productName} • OR ${payOr.trim().toUpperCase()}`);
      setTarget(null);
      // Refresh the open-items list for this member.
      const res2 = await apiFetch(`/cashier/water?q=${encodeURIComponent(member.pnNo)}`, { token });
      if (res2?.member) setLoans(res2.productLoans || []);
    } catch (e) {
      toast.error(e.message || "Payment failed.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-200">
      <div className="bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-800">
        Pay Product Loan / Rental — search member, pick the item, post with OR
      </div>
      <div className="p-3 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Account number or member name"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        {lookupErr && <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{lookupErr}</div>}
        {member && loans.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Due / return</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((pl) => (
                  <tr key={pl._id} className="border-t">
                    <td className="px-3 py-2 font-semibold">{pl.productName}</td>
                    <td className="px-3 py-2 text-xs">{pl.transactionType}</td>
                    <td className="px-3 py-2 text-xs">{(pl.returnDate || pl.dueDate) ? new Date(pl.returnDate || pl.dueDate).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">{peso(pl.balance)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openPay(pl)}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                      >
                        Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {target && (
          <div className="rounded-xl border border-violet-300 bg-violet-50/50 p-3">
            <div className="text-sm font-bold text-violet-900">
              {target.productName} — balance {peso(target.balance)} ({member?.accountName})
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">OR number *</label>
                <input
                  value={payOr}
                  onChange={(e) => setPayOr(e.target.value)}
                  autoFocus
                  placeholder="from receipt booklet"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount (₱)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                />
                <div className="mt-0.5 text-[10px] text-slate-500">Max {peso(target.balance)} — extra is capped.</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm capitalize">
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
              <button
                onClick={post}
                disabled={posting || !payOr.trim() || !(Number(payAmount) > 0)}
                className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {posting ? "Posting…" : `Post Payment ${payAmount ? peso(payAmount) : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
