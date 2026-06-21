import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { Store, MapPin, Search, PackageOpen, Loader2, Tag, Boxes, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, X, Megaphone } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_LABELS = {
  materials: "Water Materials",
  frozen_goods: "Frozen Goods",
  rice: "Rice & Varieties",
  appliance: "Appliances",
  construction: "Construction",
  rental: "Rentals",
  other: "Product Items",
};
const catLabel = (c) => CATEGORY_LABELS[c] || "Product Items";
const availOf = (p) => (p.available != null ? p.available : (Number(p.stock) || 0));

// Next 2 non-Sunday days (starting tomorrow) for pickup.
function pickupOptions() {
  const out = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  while (out.length < 2) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) out.push(new Date(d));
  }
  return out;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const niceDay = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState({}); // productId -> qty
  const [cartOpen, setCartOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // No synchronous setState — all updates happen in the async callbacks, so
  // calling this from the mount effect can't trigger cascading renders.
  function load() {
    apiFetch("/public/products")
      .then((r) => { setItems(r.items || []); setAnnouncement(r.announcement || ""); })
      .catch((e) => setErr(e.message || "Failed to load products."))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map(items.map((p) => [p._id, p])), [items]);

  function addToCart(p) {
    setCart((c) => {
      const cur = c[p._id] || 0;
      if (cur >= availOf(p)) return c; // can't exceed available
      return { ...c, [p._id]: cur + 1 };
    });
  }
  function setQty(id, qty) {
    setCart((c) => {
      const p = byId.get(id);
      const max = p ? availOf(p) : qty;
      const n = Math.max(0, Math.min(qty, max));
      const next = { ...c };
      if (n <= 0) delete next[id]; else next[id] = n;
      return next;
    });
  }
  const cartCount = Object.values(cart).reduce((s, n) => s + n, 0);
  const cartLines = Object.entries(cart).map(([id, qty]) => ({ p: byId.get(id), qty })).filter((l) => l.p);
  const cartTotal = cartLines.reduce((s, l) => s + l.p.unitPrice * l.qty, 0);

  const cats = useMemo(() => {
    const order = ["materials", "frozen_goods", "rice", "appliance", "construction", "rental", "other"];
    const present = new Set(items.map((i) => i.category || "other"));
    return order.filter((c) => present.has(c));
  }, [items]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "all" && (i.category || "other") !== cat) return false;
      if (term && !`${i.name} ${catLabel(i.category)}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, cat, q]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 px-4 pb-24 pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold text-slate-900 sm:text-3xl">
              <Store className="text-emerald-600" size={28} /> POWASSCO Store
            </h1>
            <p className="mt-2 text-sm text-slate-500">Browse what's available and reserve for pickup. Prices and stocks are updated by the office.</p>
          </div>

          {announcement && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
              <Megaphone className="mt-0.5 shrink-0 text-indigo-600" size={20} />
              <div className="text-sm text-indigo-900 whitespace-pre-wrap">{announcement}</div>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
              <MapPin className="mt-0.5 shrink-0 text-emerald-600" size={20} />
              <div className="text-sm">
                <div className="font-bold text-slate-900">Available in POWASSCO Multipurpose Cooperative building</div>
                <div className="text-slate-500">Visit us to view items in person and claim your reservation.</div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <Tag className="mt-0.5 shrink-0 text-amber-600" size={20} />
              <div className="text-sm">
                <div className="font-bold text-amber-900">Open to all Members — loanable items</div>
                <div className="text-amber-800/80"><b>Rice</b>: 1 month payable term • <b>Frozen goods</b>: 15 days payable term.</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill active={cat === "all"} onClick={() => setCat("all")}>All</Pill>
              {cats.map((c) => <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{catLabel(c)}</Pill>)}
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /> Loading products…</div>
          ) : err ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">{err}</div>
          ) : shown.length === 0 ? (
            <div className="mt-10 rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
              <PackageOpen className="mx-auto mb-2 text-slate-300" size={40} />
              No products to show{cat !== "all" ? " in this category" : ""}.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((p) => <ProductCard key={p._id} p={p} qty={cart[p._id] || 0} onAdd={() => addToCart(p)} onSet={(n) => setQty(p._id, n)} />)}
            </div>
          )}
        </div>
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && (
        <button onClick={() => setCartOpen(true)} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-2xl ring-4 ring-emerald-200 active:scale-95">
          <ShoppingCart size={18} /> {cartCount} item{cartCount > 1 ? "s" : ""} · {peso(cartTotal)}
        </button>
      )}

      <CartModal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={cartLines}
        total={cartTotal}
        onSet={setQty}
        onReserved={() => { setCart({}); setCartOpen(false); load(); }}
      />
    </>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>
  );
}

function ProductCard({ p, qty, onAdd, onSet }) {
  const avail = availOf(p);
  const out = avail <= 0;
  return (
    <div className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${out ? "border-slate-200 opacity-70" : "border-slate-200 hover:shadow-md"}`}>
      <div className="relative aspect-square w-full bg-slate-50">
        {p.imageBase64 ? (
          <img src={p.imageBase64} alt={p.name} className={`h-full w-full object-cover ${out ? "grayscale" : ""}`} loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300"><Boxes size={40} /></div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">{catLabel(p.category)}</span>
        {out && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40">
            <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-white">Not available</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-900">{p.name}</div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-base font-extrabold text-emerald-700">{peso(p.unitPrice)}</div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${out ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>{out ? "0 in stock" : `${avail} left`}</span>
        </div>
        {/* Add / qty stepper */}
        <div className="mt-2">
          {out ? (
            <button disabled className="w-full cursor-not-allowed rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-400">Unavailable</button>
          ) : qty > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1">
              <button onClick={() => onSet(qty - 1)} className="rounded-lg bg-white p-1.5 text-emerald-700 shadow-sm active:scale-90"><Minus size={14} /></button>
              <span className="text-sm font-bold text-emerald-800">{qty} in cart</span>
              <button onClick={() => onSet(qty + 1)} disabled={qty >= avail} className="rounded-lg bg-white p-1.5 text-emerald-700 shadow-sm active:scale-90 disabled:opacity-40"><Plus size={14} /></button>
            </div>
          ) : (
            <button onClick={onAdd} className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 active:scale-95">Add to cart</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CartModal({ open, onClose, lines, total, onSet, onReserved }) {
  const [pnNo, setPnNo] = useState("");
  const [phone, setPhone] = useState("");
  const [verify, setVerify] = useState(null); // { ok, accountName, blocked, hasSavings, savingsBalance } | { error }
  const [verifying, setVerifying] = useState(false);
  const [pickup, setPickup] = useState(ymd(pickupOptions()[0]));
  const [payMethod, setPayMethod] = useState("cash"); // "cash" | "savings"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // { code, total }
  const options = useMemo(() => pickupOptions(), []);
  const savingsOk = verify?.ok && verify.hasSavings && (verify.savingsBalance || 0) >= total;

  async function doVerify() {
    const code = pnNo.trim().toUpperCase();
    if (!code) return;
    setVerifying(true); setVerify(null); setErr("");
    try {
      const r = await apiFetch("/public/products/verify-account", { method: "POST", body: { pnNo: code } });
      setVerify(r);
    } catch (e) {
      setVerify({ error: e.message || "Account not found." });
    } finally { setVerifying(false); }
  }

  async function reserve() {
    setErr("");
    if (!verify?.ok) return setErr("Verify your account number first.");
    if (verify.blocked) return setErr("This account can't reserve right now (2 unclaimed reservations in the last 3 months).");
    if (!phone.trim()) return setErr("Enter your phone number.");
    if (lines.length === 0) return setErr("Your cart is empty.");
    setBusy(true);
    try {
      const r = await apiFetch("/public/products/reserve", {
        method: "POST",
        body: { pnNo: pnNo.trim().toUpperCase(), phone: phone.trim(), pickupDate: pickup, paymentMethod: savingsOk ? payMethod : "cash", items: lines.map((l) => ({ productId: l.p._id, quantity: l.qty })) },
      });
      setDone({ code: r.code, total: r.total, message: r.message });
    } catch (e) {
      setErr(e.message || "Could not reserve.");
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} title={done ? "Reservation confirmed" : "Your reservation"} onClose={() => { if (done) { onReserved(); setDone(null); } onClose(); }} size="md">
      {done ? (
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
          <div className="text-lg font-extrabold text-slate-900">Code {done.code}</div>
          <p className="text-sm text-slate-600">{done.message}</p>
          <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">Total to pay: {peso(done.total)}</div>
          <p className="text-xs text-slate-400">Bring your account number to the cashier. Unclaimed reservations expire in 2 days. 2 no-shows = no reservations for 3 months — please reserve responsibly.</p>
          <button onClick={() => { onReserved(); setDone(null); }} className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white">Done</button>
        </div>
      ) : lines.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500"><ShoppingCart className="mx-auto mb-2 text-slate-300" size={36} /> Your cart is empty.</div>
      ) : (
        <div className="space-y-4">
          {/* Items */}
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.p._id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                  {l.p.imageBase64 ? <img src={l.p.imageBase64} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Boxes size={18} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-800">{l.p.name}</div>
                  <div className="text-xs text-slate-500">{peso(l.p.unitPrice)} × {l.qty} = <b>{peso(l.p.unitPrice * l.qty)}</b></div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onSet(l.p._id, l.qty - 1)} className="rounded-lg border border-slate-200 p-1.5 active:scale-90"><Minus size={13} /></button>
                  <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                  <button onClick={() => onSet(l.p._id, l.qty + 1)} disabled={l.qty >= availOf(l.p)} className="rounded-lg border border-slate-200 p-1.5 active:scale-90 disabled:opacity-40"><Plus size={13} /></button>
                  <button onClick={() => onSet(l.p._id, 0)} className="ml-1 rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-base font-extrabold text-slate-900">
            <span>Total</span><span className="text-emerald-700">{peso(total)}</span>
          </div>

          {/* Member details */}
          <div className="space-y-3 rounded-2xl border border-slate-200 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reserve for pickup</div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Account Number <span className="text-red-500">*</span></label>
              <div className="mt-1 flex gap-2">
                <input value={pnNo} onChange={(e) => { setPnNo(e.target.value.toUpperCase()); setVerify(null); }} placeholder="e.g. PN123" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:border-emerald-400 focus:outline-none" />
                <button onClick={doVerify} disabled={verifying || !pnNo.trim()} className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{verifying ? "…" : "Verify"}</button>
              </div>
              {verify?.ok && !verify.blocked && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} /> {verify.accountName}</span>
                  {verify.hasSavings && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-700">Savings: {peso(verify.savingsBalance)}</span>}
                </div>
              )}
              {verify?.ok && verify.blocked && <div className="mt-1 text-xs font-semibold text-red-600">This account is blocked from reserving (2 unclaimed reservations in 3 months).</div>}
              {verify?.error && <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600"><X size={13} /> {verify.error}</div>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Phone Number <span className="text-red-500">*</span></label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxxx" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Pickup Day <span className="text-slate-400">(working hours, no Sundays)</span></label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {options.map((d) => {
                  const v = ymd(d);
                  return (
                    <button key={v} onClick={() => setPickup(v)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${pickup === v ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{niceDay(d)}</button>
                  );
                })}
              </div>
            </div>
            {/* Payment method */}
            <div>
              <label className="text-xs font-semibold text-slate-700">Payment</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button onClick={() => setPayMethod("cash")} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${payMethod === "cash" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>Pay at cashier</button>
                <button onClick={() => savingsOk && setPayMethod("savings")} disabled={!savingsOk} title={!verify?.ok ? "Verify your account first" : !verify?.hasSavings ? "No savings account" : (verify?.savingsBalance || 0) < total ? "Not enough savings" : ""} className={`rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40 ${payMethod === "savings" && savingsOk ? "border-pink-400 bg-pink-50 text-pink-700" : "border-slate-200 text-slate-600"}`}>Pay with savings</button>
              </div>
              {payMethod === "savings" && savingsOk && <div className="mt-1 text-[11px] text-pink-700">We'll deduct {peso(total)} from your savings at the cashier once approved.</div>}
              {verify?.ok && verify.hasSavings && (verify.savingsBalance || 0) < total && <div className="mt-1 text-[11px] text-slate-400">Savings balance is below this order total, so "Pay with savings" is unavailable.</div>}
            </div>
          </div>

          {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}

          <button onClick={reserve} disabled={busy || !verify?.ok || verify?.blocked || !phone.trim()} className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "Reserving…" : `Reserve ${peso(total)}`}
          </button>
          <p className="text-center text-[11px] text-slate-400">We hold your items for 2 days. Pay at the cashier to confirm. Please reserve responsibly — 2 no-shows blocks reservations for 3 months.</p>
        </div>
      )}
    </Modal>
  );
}
