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
  ShoppingBag, Plus, Search, User, UserPlus, Receipt, RefreshCw, Printer,
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
  return {
    title: "SALES OR",
    accountName: customer,
    orNo: sale.orNo,
    cashierName,
    lines: [
      ["Product", String(sale.productName || "Product").slice(0, 20)],
      ["Quantity", String(sale.quantity || 1)],
      ["Unit price", peso(sale.unitPrice)],
    ],
    total: Number(sale.principal) || 0,
    totalLabel: "PAID",
    note: "Thank you for your purchase!",
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
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [orNo, setOrNo] = useState("");
  const [method, setMethod] = useState("cash");
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
    setProductId("");
    setQuantity(1);
    setOrNo("");
    setMethod("cash");
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

  const product = catalog.find((p) => p._id === productId);
  const unitPrice = Number(product?.unitPrice) || 0;
  const total = unitPrice * Math.max(1, Number(quantity) || 1);
  const savingsOk = savingsBal != null && savingsBal >= total && total > 0;
  // If savings was selected but is no longer valid, fall back to cash.
  useEffect(() => { if (method === "savings" && !savingsOk) setMethod("cash"); }, [method, savingsOk]);

  async function submit() {
    if (!product) { toast.error("Pick a product first."); return; }
    if (mode === "member" && !member) { toast.error("Pick a member or switch to Walk-in."); return; }
    if (mode === "walkin" && !customerName.trim()) { toast.error("Enter the walk-in customer name."); return; }
    if (!orNo.trim()) { toast.error("Enter the OR number from the receipt booklet."); return; }
    setSubmitting(true);
    const saleOr = orNo.trim().toUpperCase();
    try {
      const body = {
        transactionType: "sale",
        productId: product._id,
        quantity: Math.max(1, Number(quantity) || 1),
        orNo: saleOr,
        method,
        remarks: remarks.trim(),
      };
      if (mode === "member") {
        body.pnNo = member.pnNo;
      } else {
        body.customerName = customerName.trim();
        body.customerContact = customerContact.trim();
      }
      const res = await apiFetch("/bookkeeper/product-applications", {
        method: "POST",
        token,
        body,
      });
      // Capture for the receipt + show the success state in the modal
      // without closing it, so the cashier can hit Print and then close.
      // The created doc keeps the OR inside payments[0]; surface the
      // typed OR directly so the receipt always shows it.
      const sale = {
        ...res,
        orNo: saleOr,
        productName: product.name,
        unitPrice,
        quantity: body.quantity,
        principal: total,
      };
      setLastSale(sale);
      toast.success(`Sale posted • OR ${saleOr}`);
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
                <div><span className="text-slate-500">Total paid</span> <span className="font-bold text-emerald-700">{peso(lastSale.principal)}</span></div>
                <div className="col-span-2">
                  <span className="text-slate-500">Product</span> {lastSale.productName} × {lastSale.quantity}
                </div>
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

            {/* Product picker */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Product</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
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
              <div>
                <label className="text-xs font-semibold text-slate-600">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                />
              </div>
            </div>

            {/* OR + method + remarks */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">OR number *</label>
                <input
                  value={orNo}
                  onChange={(e) => setOrNo(e.target.value)}
                  placeholder="from receipt booklet"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Payment method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  {mode === "member" && member && savingsBal != null && (
                    <option value="savings" disabled={!savingsOk}>Pay with Savings (₱{savingsBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}){savingsOk ? "" : " — insufficient"}</option>
                  )}
                </select>
                {method === "savings" && savingsOk && (
                  <div className="mt-1 text-[11px] font-semibold text-pink-700">₱{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} will be deducted from the member's savings.</div>
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

            {/* Total */}
            <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-orange-900">
                {product ? `${product.name} × ${quantity} @ ${peso(unitPrice)}` : "Pick a product"}
              </div>
              <div className="text-xl font-bold text-orange-700 font-mono">
                {peso(total)}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !product || total <= 0 || !orNo.trim() || (mode === "member" && !member) || (mode === "walkin" && !customerName.trim())}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <Receipt size={14} /> {submitting ? "Posting…" : `Post Sale ${peso(total)}`}
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
