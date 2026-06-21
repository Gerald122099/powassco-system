import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useRealtime } from "../../lib/realtime";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Package, Plus, RefreshCw, Trash2, Edit3, ShoppingBag, CheckCircle, XCircle, ImagePlus } from "lucide-react";

const peso = (n) => "₱" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORIES = [
  { value: "frozen_goods", label: "Frozen goods" },
  { value: "rice", label: "Rice" },
  { value: "materials", label: "Materials" },
  { value: "rental", label: "Rental (borrow/return)" },
  { value: "appliance", label: "Appliance" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Other" },
];
// Read an image file → a small JPEG data URL (≤~480px) so the catalog
// thumbnail stays light (well under the 200 KB cap).
function readImageAsThumb(file, maxSize = 480, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) { height = Math.round((height * maxSize) / width); width = maxSize; }
          else { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EMPTY = {
  name: "",
  category: "other",
  unitPrice: "",
  capital: 0,
  profit: 0,
  stock: 0,
  description: "",
  imageBase64: "",
  minCbuRequired: 0,
  isRental: false,
  rentFee: 0,
  isActive: true,
};

export default function ProductLoansPanel() {
  const { token } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [totals, setTotals] = useState(null);
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({ pnNo: "", productId: "", quantity: 1, remarks: "" });
  // Debounced lookup result for the Account Number field — green
  // confirmation when found, red explanation when not. Lets the
  // bookkeeper double-check they're filing against the right member
  // before submitting.
  const [memberLookup, setMemberLookup] = useState({ status: "idle", name: "", cbuBalance: 0, error: "" });

  const [releaseTarget, setReleaseTarget] = useState(null);
  const [useCbu, setUseCbu] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      apiFetch("/bookkeeper/product-analytics", { token }).then((r) => setTotals(r.overall)).catch(() => {});
      const [cat, ap] = await Promise.all([
        apiFetch("/bookkeeper/product-catalog", { token }),
        apiFetch("/bookkeeper/product-applications", { token }),
      ]);
      setCatalog(cat);
      setApps(ap);
    } catch {/* ignore */} finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useRealtime(["loans", "payments", "products"], load);

  // Debounced Account Number lookup — fires whenever the bookkeeper
  // types in the pnNo input of the apply modal. Hits the existing
  // /water/members/pn/:pnNo endpoint, surfaces the account name +
  // CBU balance so the wrong member can't be filed against by
  // accident.
  useEffect(() => {
    if (!applyOpen) return;
    const pn = applyForm.pnNo.trim();
    if (!pn) {
      setMemberLookup({ status: "idle", name: "", cbuBalance: 0, error: "" });
      return;
    }
    setMemberLookup((p) => ({ ...p, status: "loading" }));
    const t = setTimeout(async () => {
      try {
        const m = await apiFetch(`/water/members/pn/${encodeURIComponent(pn)}`, { token });
        setMemberLookup({
          status: "found",
          name: m.accountName || "",
          cbuBalance: Number(m.cbuBalance || 0),
          error: "",
        });
      } catch (e) {
        setMemberLookup({ status: "missing", name: "", cbuBalance: 0, error: e.message || "Not found" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [applyForm.pnNo, applyOpen, token]);

  function openAdd() { setEditing(null); setForm(EMPTY); setCatalogModalOpen(true); }
  function openEdit(p) { setEditing(p); setForm({ ...EMPTY, ...p }); setCatalogModalOpen(true); }
  function closeCatalog() { setCatalogModalOpen(false); setEditing(null); setForm(EMPTY); }

  async function saveProduct(e) {
    e?.preventDefault?.();
    try {
      if (!form.name || !(Number(form.unitPrice) > 0)) return toast.error("Name and unit price are required.");
      if (editing) await apiFetch(`/bookkeeper/product-catalog/${editing._id}`, { method: "PUT", token, body: form });
      else await apiFetch("/bookkeeper/product-catalog", { method: "POST", token, body: form });
      toast.success(editing ? "Product updated" : "Product added");
      closeCatalog(); load();
    } catch (e) { toast.error(e.message); }
  }

  async function removeProduct(p) {
    if (!confirm(`Remove "${p.name}" from the catalogue?`)) return;
    try { await apiFetch(`/bookkeeper/product-catalog/${p._id}`, { method: "DELETE", token }); toast.success("Removed"); load(); }
    catch (e) { toast.error(e.message); }
  }

  async function submitApplication(e) {
    e?.preventDefault?.();
    try {
      const res = await apiFetch("/bookkeeper/product-applications", { method: "POST", token, body: applyForm });
      toast.success(`Application approved (${res.productName} × ${res.quantity})`);
      setApplyOpen(false);
      setApplyForm({ pnNo: "", productId: "", quantity: 1, remarks: "" });
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function release() {
    try {
      const res = await apiFetch(`/bookkeeper/product-applications/${releaseTarget._id}/release`, { method: "POST", token, body: { useCbu: Number(useCbu) || 0 } });
      toast.success(`Released. CBU applied ${peso(res.application.cbuApplied)}; remaining balance ${peso(res.application.balance)}.`);
      setReleaseTarget(null); setUseCbu(0); load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Package size={20} className="text-blue-600" /> Product Loans
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Catalogue of in-kind product loans (meter, sack of rice, …) and per-member applications.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setApplyOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <ShoppingBag size={16}/> New Application
          </button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Plus size={16}/> Add Product</button>
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Business totals */}
      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3"><div className="text-[10px] uppercase tracking-wide text-blue-700">Total capital</div><div className="mt-1 font-mono text-lg font-extrabold text-blue-800">{peso(totals.capital)}</div></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] uppercase tracking-wide text-amber-700">Total sold</div><div className="mt-1 font-mono text-lg font-extrabold text-amber-800">{peso(totals.revenue)}</div></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-[10px] uppercase tracking-wide text-emerald-700">Total profit</div><div className="mt-1 font-mono text-lg font-extrabold text-emerald-800">{peso(totals.profit)}</div></div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3"><div className="text-[10px] uppercase tracking-wide text-violet-700">Interest / late penalties</div><div className="mt-1 font-mono text-lg font-extrabold text-violet-800">{peso(totals.latePenalty)}</div></div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">Paid</div><div className="mt-1 font-mono text-lg font-extrabold text-emerald-700">{peso(totals.paid)}</div></div>
          <div className="rounded-2xl border border-rose-200 bg-white p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">Unpaid</div><div className="mt-1 font-mono text-lg font-extrabold text-rose-700">{peso(totals.unpaid)}</div></div>
        </div>
      )}

      {/* Catalogue */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Catalogue ({catalog.length})</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((p) => (
            <div key={p._id} className={`rounded-2xl border p-4 ${p.isActive ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {p.imageBase64 && <img src={p.imageBase64} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />}
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.category || "—"}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-blue-700">{peso(p.unitPrice)}</div>
                  <div className="text-[11px] text-slate-500">stock {p.stock}</div>
                </div>
              </div>
              {p.description && <p className="mt-2 text-xs text-slate-600">{p.description}</p>}
              {Number(p.minCbuRequired) > 0 && <p className="mt-1 text-[11px] text-amber-700">Requires CBU ≥ {peso(p.minCbuRequired)}</p>}
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className={`rounded-full px-2 py-0.5 font-bold ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{p.isActive ? "ACTIVE" : "INACTIVE"}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(p)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Edit3 size={12}/></button>
                  <button onClick={() => removeProduct(p)} className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"><Trash2 size={12}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Applications */}
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Applications ({apps.length})</div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">Member</th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">CBU applied</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-500">No applications yet.</td></tr>
              ) : apps.map((a) => (
                <tr key={a._id} className="border-t">
                  <td className="px-3 py-2"><div className="font-semibold">{a.accountName}</div><div className="text-[11px] text-slate-500 font-mono">{a.pnNo}</div></td>
                  <td className="px-3 py-2">{a.productName} × {a.quantity}</td>
                  <td className="px-3 py-2 text-right font-bold">{peso(a.totalPrice)}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{peso(a.cbuApplied)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{peso(a.balance)}</td>
                  <td className="px-3 py-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-bold ${a.status === "fully_paid" ? "bg-emerald-100 text-emerald-700" : a.status === "released" ? "bg-blue-100 text-blue-700" : a.status === "approved" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>{a.status}</span></td>
                  <td className="px-3 py-2 text-right">
                    {a.status === "approved" && (
                      <button onClick={() => { setReleaseTarget(a); setUseCbu(0); }} className="rounded-lg border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">Release</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Catalogue add/edit modal */}
      <Modal open={catalogModalOpen} title={editing ? `Edit ${editing.name}` : "Add Product"} onClose={closeCatalog} size="sm">
        <form onSubmit={saveProduct} className="space-y-3">
          {/* Item image (optional) — shown on the public store + analytics. */}
          <div>
            <label className="text-xs font-semibold">Item image</label>
            <div className="mt-1 flex items-center gap-3">
              {form.imageBase64 ? (
                <img src={form.imageBase64} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300"><ImagePlus size={22} /></div>
              )}
              <div className="flex flex-col items-start gap-1">
                <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  {form.imageBase64 ? "Change image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try { const b64 = await readImageAsThumb(f); setForm((s) => ({ ...s, imageBase64: b64 })); }
                      catch { toast.error("Couldn't read that image."); }
                    }}
                  />
                </label>
                {form.imageBase64 && (
                  <button type="button" onClick={() => setForm((s) => ({ ...s, imageBase64: "" }))} className="text-xs font-semibold text-red-600 hover:underline">Remove image</button>
                )}
                <span className="text-[10px] text-slate-400">JPG/PNG — auto-resized for the store.</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold">Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value;
                  setForm({ ...form, category: cat, isRental: cat === "rental" });
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Unit Price (₱) *</label>
              <input type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-semibold">Capital (₱)</label>
              <input
                type="number"
                step="0.01"
                value={form.capital}
                onChange={(e) => {
                  const cap = e.target.value;
                  // Auto-compute profit when capital changes (admin
                  // can override below). unitPrice − capital = profit.
                  const price = Number(form.unitPrice) || 0;
                  setForm({ ...form, capital: cap, profit: Math.max(0, price - (Number(cap) || 0)).toFixed(2) });
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
              <div className="mt-0.5 text-[10px] text-slate-500">Co-op's cost basis</div>
            </div>
            <div>
              <label className="text-xs font-semibold">Profit (₱)</label>
              <input
                type="number"
                step="0.01"
                value={form.profit}
                onChange={(e) => setForm({ ...form, profit: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
              <div className="mt-0.5 text-[10px] text-slate-500">Auto-fills from price − capital; editable</div>
            </div>
            <div>
              <label className="text-xs font-semibold">Stock</label>
              <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-semibold">Min CBU required (₱)</label>
              <input type="number" step="0.01" value={form.minCbuRequired} onChange={(e) => setForm({ ...form, minCbuRequired: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            {/* Rental-only fee. Shown only when category is "rental"
                so the form doesn't clutter for regular products. */}
            {(form.category === "rental" || form.isRental) && (
              <div className="col-span-2">
                <label className="text-xs font-semibold text-purple-700">Rental Fee (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.rentFee}
                  onChange={(e) => setForm({ ...form, rentFee: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-purple-300 bg-purple-50 px-3 py-2"
                />
                <div className="mt-0.5 text-[10px] text-purple-700">Charged at borrow time. Late-return penalty (per day) is set in Admin → Loan Settings.</div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeCatalog} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{editing ? "Save" : "Add"}</button>
          </div>
        </form>
      </Modal>

      {/* Application modal */}
      <Modal open={applyOpen} title="New Product-Loan Application" onClose={() => setApplyOpen(false)} size="sm">
        <form onSubmit={submitApplication} className="space-y-3">
          <div>
            <label className="text-xs font-semibold">Member Account No.</label>
            <input
              value={applyForm.pnNo}
              onChange={(e) => setApplyForm({ ...applyForm, pnNo: e.target.value.toUpperCase() })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
              placeholder="e.g. K8M3PQ"
            />
            {/* Live lookup so the bookkeeper sees who they're filing
                against the moment they finish typing. Green = found
                + CBU snapshot, red = no such account. */}
            {memberLookup.status === "loading" && (
              <div className="mt-1.5 text-[11px] text-slate-500">Looking up…</div>
            )}
            {memberLookup.status === "found" && (
              <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px]">
                <span className="font-bold text-emerald-800">{memberLookup.name}</span>
                <span className="ml-2 text-emerald-700">CBU ₱{memberLookup.cbuBalance.toFixed(2)}</span>
              </div>
            )}
            {memberLookup.status === "missing" && (
              <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                {memberLookup.error || "Account not found"}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold">Product</label>
            <select value={applyForm.productId} onChange={(e) => setApplyForm({ ...applyForm, productId: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Select…</option>
              {catalog.filter((p) => p.isActive).map((p) => (<option key={p._id} value={p._id}>{p.name} — {peso(p.unitPrice)} (stock {p.stock})</option>))}
            </select>
          </div>
          <div><label className="text-xs font-semibold">Quantity</label><input type="number" min={1} value={applyForm.quantity} onChange={(e) => setApplyForm({ ...applyForm, quantity: Number(e.target.value) || 1 })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></div>
          <div><label className="text-xs font-semibold">Remarks</label><textarea rows={2} value={applyForm.remarks} onChange={(e) => setApplyForm({ ...applyForm, remarks: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setApplyOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Approve Application</button>
          </div>
        </form>
      </Modal>

      {/* Release modal */}
      <Modal open={!!releaseTarget} title="Release Product Loan" subtitle={releaseTarget ? `${releaseTarget.productName} × ${releaseTarget.quantity} for ${releaseTarget.accountName}` : ""} onClose={() => setReleaseTarget(null)} size="sm">
        {releaseTarget && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Total price</span><b>{peso(releaseTarget.totalPrice)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Apply from CBU</span><b className="text-blue-700">{peso(useCbu)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Remaining balance</span><b className="text-red-600">{peso(Math.max(0, Number(releaseTarget.totalPrice) - Number(useCbu || 0)))}</b></div>
            </div>
            <div>
              <label className="text-xs font-semibold">CBU to apply (₱)</label>
              <input type="number" step="0.01" min={0} max={releaseTarget.totalPrice} value={useCbu} onChange={(e) => setUseCbu(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-right font-mono" />
              <div className="mt-0.5 text-[11px] text-slate-500">Leave 0 to amortise the whole amount later.</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setReleaseTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
              <button onClick={release} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Release</button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
