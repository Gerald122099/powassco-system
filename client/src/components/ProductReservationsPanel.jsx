// Staff view of public-store reservations. Office (manager / water officer)
// verifies + approves and later marks pickup; the cashier collects payment.
// Same component, role-aware actions.
import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { toast } from "./Toast";
import { printReceiptSmart } from "../lib/printerSettings";
import { RefreshCw, Phone, CheckCircle2, Banknote, PackageCheck, XCircle, Clock, PiggyBank, Wallet, ShoppingBag, Megaphone, Save } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toLocaleString() : "—");
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—");

const STATUS = {
  reserved: { label: "Pending approval", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved — for payment", cls: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid — for pickup", cls: "bg-emerald-100 text-emerald-700" },
  picked_up: { label: "Picked up", cls: "bg-slate-200 text-slate-600" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-600" },
  no_show: { label: "No-show", cls: "bg-red-100 text-red-700" },
};
const TABS = [
  ["reserved", "Pending"], ["approved", "Approved"], ["paid", "For pickup"],
  ["picked_up", "Picked up"], ["", "All"],
];

export default function ProductReservationsPanel() {
  const { token, user } = useAuth();
  const role = user?.role;
  const isOffice = ["admin", "manager", "water_bill_officer"].includes(role);
  const isCashier = ["admin", "cashier"].includes(role);

  const [status, setStatus] = useState("reserved");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [ann, setAnn] = useState({ announcement: "", announcementActive: false });
  const [annLoaded, setAnnLoaded] = useState(false);
  const [savingAnn, setSavingAnn] = useState(false);

  useEffect(() => {
    if (!isOffice) return;
    apiFetch("/product-reservations/store-settings", { token })
      .then((r) => { setAnn({ announcement: r.announcement || "", announcementActive: !!r.announcementActive }); })
      .catch(() => {})
      .finally(() => setAnnLoaded(true));
  }, [isOffice, token]);

  async function saveAnn() {
    setSavingAnn(true);
    try {
      const r = await apiFetch("/product-reservations/store-settings", { method: "PUT", token, body: ann });
      setAnn({ announcement: r.announcement || "", announcementActive: !!r.announcementActive });
      toast.success("Store announcement updated.");
    } catch (e) { toast.error(e.message); } finally { setSavingAnn(false); }
  }

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams(status ? { status } : {});
      const r = await apiFetch(`/product-reservations?${qs}`, { token });
      setItems(r.items || []);
      setCounts(r.byStatus || {});
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function act(r, action) {
    let body = {};
    if (action === "pay") {
      const or = window.prompt(`OR number for ${r.code} — ${peso(r.total)}${r.paymentMethod === "savings" ? " (deduct from SAVINGS)" : ""}:`, "");
      if (or === null || !or.trim()) return;
      body = { orNo: or.trim() };
    }
    if (action === "cancel" && !window.confirm(`Cancel ${r.code}? This releases the held stock.`)) return;
    setBusyId(r._id);
    try {
      await apiFetch(`/product-reservations/${r._id}/${action}`, { method: "POST", token, body });
      toast.success(action === "approve" ? "Approved — send to cashier." : action === "pay" ? "Paid — ready for pickup." : action === "pickup" ? "Marked picked up." : "Cancelled.");
      // Auto-print the OR receipt on payment (respects the cashier's printer
      // settings; falls back to the default printer).
      if (action === "pay") {
        printReceiptSmart({
          title: "STORE RESERVATION OR",
          accountName: r.accountName,
          pnNo: r.pnNo,
          orNo: body.orNo,
          cashierName: user?.fullName || user?.employeeId || "",
          lines: r.items.map((it) => [`${it.quantity}x ${it.name}`.slice(0, 18), peso(it.lineTotal)]),
          total: r.total,
          totalLabel: r.paymentMethod === "savings" ? "PAID (SAVINGS)" : "PAID",
          note: `Reservation ${r.code}. Show this for pickup.`,
        }).then((pr) => { if (pr?.via === "thermal") toast.success("Receipt printed."); }).catch(() => {});
      }
      load();
    } catch (e) { toast.error(e.message); } finally { setBusyId(""); }
  }

  const total = useMemo(() => Object.values(counts).reduce((s, n) => s + n, 0), [counts]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <ShoppingBag size={20} className="text-emerald-600" /> Store Reservations
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            {isCashier && !isOffice ? "Collect payment on approved reservations." : "Verify by phone, approve, then mark pickup after the cashier collects."}
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Reload
        </button>
      </div>

      {isOffice && annLoaded && (
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-800"><Megaphone size={16} /> Store announcement <span className="font-normal text-indigo-500">(shown on the public store)</span></div>
          <textarea rows={2} value={ann.announcement} onChange={(e) => setAnn((a) => ({ ...a, announcement: e.target.value }))} placeholder="e.g. New rice stock in! Store open Mon–Sat, 8am–5pm." className="mt-2 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
          <div className="mt-2 flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-800"><input type="checkbox" checked={ann.announcementActive} onChange={(e) => setAnn((a) => ({ ...a, announcementActive: e.target.checked }))} /> Show on store</label>
            <button onClick={saveAnn} disabled={savingAnn} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><Save size={13} /> {savingAnn ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k || "all"} onClick={() => setStatus(k)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${status === k ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {label}
            {k && counts[k] > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${status === k ? "bg-white/25" : "bg-amber-100 text-amber-700"}`}>{counts[k]}</span>}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-400">{total} total</span>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="py-10 text-center text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No reservations here.</div>
        ) : items.map((r) => {
          const st = STATUS[r.status] || STATUS.reserved;
          const busy = busyId === r._id;
          return (
            <div key={r._id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{r.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${r.paymentMethod === "savings" ? "bg-pink-50 text-pink-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.paymentMethod === "savings" ? <PiggyBank size={11} /> : <Wallet size={11} />}
                      {r.paymentMethod === "savings" ? "Savings" : "Cash"}
                    </span>
                  </div>
                  <div className="mt-1 font-bold text-slate-900">{r.accountName} <span className="font-mono text-xs font-normal text-slate-500">({r.pnNo})</span></div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-slate-600">
                    <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Phone size={13} /> {r.phone}</a>
                    <span className="inline-flex items-center gap-1 text-xs"><Clock size={12} /> Pickup {day(r.pickupDate)}</span>
                    {r.orNo && <span className="font-mono text-xs">OR {r.orNo}</span>}
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                    {r.items.map((it, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-slate-400">{it.quantity}×</span> {it.name}
                        <span className="text-xs text-slate-400">@ {peso(it.unitPrice)}</span>
                        <span className="ml-auto font-semibold">{peso(it.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1.5 text-[11px] text-slate-400">Reserved {when(r.createdAt)}{r.approvedBy ? ` • approved by ${r.approvedBy}` : ""}{r.handledBy && r.status !== "approved" ? ` • by ${r.handledBy}` : ""}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Total</div>
                    <div className="text-xl font-extrabold text-emerald-700">{peso(r.total)}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {r.status === "reserved" && isOffice && (
                      <button onClick={() => act(r, "approve")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><CheckCircle2 size={13} /> Approve</button>
                    )}
                    {r.status === "approved" && isCashier && (
                      <button onClick={() => act(r, "pay")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Banknote size={13} /> {r.paymentMethod === "savings" ? "Pay (savings)" : "Collect payment"}</button>
                    )}
                    {r.status === "paid" && isOffice && (
                      <button onClick={() => act(r, "pickup")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"><PackageCheck size={13} /> Mark picked up</button>
                    )}
                    {(r.status === "reserved" || r.status === "approved") && isOffice && (
                      <button onClick={() => act(r, "cancel")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><XCircle size={13} /> Cancel</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
