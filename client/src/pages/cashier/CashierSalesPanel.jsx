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
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
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

function printSaleReceipt({ sale, cashierName }) {
  const w = window.open("", "_blank", "width=440,height=640");
  if (!w) return alert("Allow pop-ups to print.");
  const productLine = sale.productName || "Product";
  const customerLine = sale.borrowerPnNo
    ? `${sale.borrowerName || ""} (${sale.borrowerPnNo})`
    : `${sale.customerName || "Walk-in"}${sale.customerContact ? ` • ${sale.customerContact}` : ""}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>OR ${sale.orNo || ""}</title>
    <style>@page{size:A6;margin:6mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
    h1{font-size:14px;color:#0f766e;margin:0 0 4px}.row{display:flex;justify-content:space-between;margin:2px 0}
    .total{margin-top:8px;text-align:right;font-weight:bold;font-size:15px;color:#0f766e}
    .muted{color:#64748b;font-size:10px}.line{border-bottom:1px dashed #cbd5e1;margin:6px 0}
    </style></head><body>
    <h1>POWASSCO — Sales OR</h1>
    <div class="muted">OR ${sale.orNo || "—"} • ${new Date().toLocaleString()} • by ${cashierName || ""}</div>
    <div class="line"></div>
    <div class="row"><span>Customer</span><b>${customerLine}</b></div>
    <div class="row"><span>Product</span><span>${productLine}</span></div>
    <div class="row"><span>Quantity</span><span>${sale.quantity || 1}</span></div>
    <div class="row"><span>Unit Price</span><span>₱${(Number(sale.unitPrice) || 0).toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="total">PAID ₱${(Number(sale.principal) || 0).toFixed(2)}</div>
    <div class="muted" style="margin-top:8px">Thank you for your purchase.</div>
    </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 250);
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
  const [method, setMethod] = useState("cash");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState(null);

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

  function resetForm() {
    setMode("member");
    setMemberQ("");
    setMember(null);
    setMemberLookup({ status: "idle", error: "" });
    setCustomerName("");
    setCustomerContact("");
    setProductId("");
    setQuantity(1);
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
        // Name search via cashier water endpoint (returns members)
        const res = await apiFetch(`/cashier/water?q=${encodeURIComponent(q)}`, { token });
        const candidates = res?.members || [];
        if (candidates.length === 1) {
          setMember(candidates[0]);
          setMemberLookup({ status: "found", error: "" });
        } else if (candidates.length > 1) {
          setMember(null);
          setMemberLookup({ status: "ambiguous", error: `${candidates.length} matches — type the full account number.` });
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

  const product = catalog.find((p) => p._id === productId);
  const unitPrice = Number(product?.unitPrice) || 0;
  const total = unitPrice * Math.max(1, Number(quantity) || 1);

  async function submit() {
    if (!product) { toast.error("Pick a product first."); return; }
    if (mode === "member" && !member) { toast.error("Pick a member or switch to Walk-in."); return; }
    if (mode === "walkin" && !customerName.trim()) { toast.error("Enter the walk-in customer name."); return; }
    setSubmitting(true);
    try {
      const body = {
        transactionType: "sale",
        productId: product._id,
        quantity: Math.max(1, Number(quantity) || 1),
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
      setLastSale({
        ...res,
        productName: product.name,
        unitPrice,
        quantity: body.quantity,
        principal: total,
      });
      toast.success(`Sale posted • OR ${res.orNo || ""}`);
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
                    {s.borrowerName || s.customerName || "—"}
                    {s.borrowerPnNo && <div className="text-[10px] font-mono text-slate-500">{s.borrowerPnNo}</div>}
                    {!s.borrowerPnNo && s.customerContact && <div className="text-[10px] text-slate-500">{s.customerContact}</div>}
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
                onClick={() => printSaleReceipt({ sale: lastSale, cashierName: user?.fullName || user?.employeeId })}
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

            {/* Method + remarks */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Payment method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                >
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
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
                disabled={submitting || !product || total <= 0 || (mode === "member" && !member) || (mode === "walkin" && !customerName.trim())}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <Receipt size={14} /> {submitting ? "Posting…" : `Post Sale ${peso(total)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
