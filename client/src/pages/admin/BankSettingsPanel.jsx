// Admin Bank Settings — register the banks the cooperative uses.
// Bookkeeper picks from this registry when adding real accounts.
// Logo is stored as a small data-URL (≤200KB) so no file hosting
// is needed.

import { useEffect, useState, useCallback } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "../../components/Toast";
import { Landmark, Plus, Pencil, RefreshCw } from "lucide-react";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 200 * 1024) return reject(new Error("Logo must be 200KB or smaller."));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function BankSettingsPanel() {
  const { token } = useAuth();
  const [banks, setBanks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // null=closed, {}=new, {...}=edit
  const [form, setForm] = useState({ name: "", logo: "", isActive: true });

  const load = useCallback(async () => {
    setBusy(true);
    try { setBanks(await apiFetch("/treasury/banks", { token })); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function openNew() { setForm({ name: "", logo: "", isActive: true }); setEditing({}); }
  function openEdit(b) { setForm({ name: b.name, logo: b.logo || "", isActive: b.isActive !== false }); setEditing(b); }

  async function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((p) => ({ ...p, logo: dataUrl }));
    } catch (err) { toast.error(err.message); }
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Bank name is required.");
    try {
      if (editing?._id) {
        await apiFetch(`/treasury/banks/${editing._id}`, { method: "PUT", token, body: form });
        toast.success("Bank updated.");
      } else {
        await apiFetch("/treasury/banks", { method: "POST", token, body: form });
        toast.success("Bank registered.");
      }
      setEditing(null);
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Landmark size={20} className="text-teal-600" /> Bank Settings
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            Register the banks the cooperative uses. The bookkeeper adds real accounts from this list in their Treasury tab.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
          <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">
            <Plus size={14} /> Register Bank
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {!banks.length ? (
          <div className="col-span-full rounded-2xl border border-slate-200 py-10 text-center text-sm text-slate-500">
            No banks registered yet.
          </div>
        ) : banks.map((b) => (
          <div key={b._id} className={`rounded-2xl border p-4 ${b.isActive === false ? "border-slate-200 opacity-50" : "border-teal-200"}`}>
            <div className="flex items-center gap-3">
              {b.logo ? (
                <img src={b.logo} alt={b.name} className="h-10 w-10 rounded-lg object-contain bg-white border border-slate-100" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-700"><Landmark size={18} /></div>
              )}
              <div>
                <div className="text-sm font-bold text-slate-900">{b.name}</div>
                <div className="text-[10px] text-slate-400">{b.isActive === false ? "inactive" : "active"}</div>
              </div>
            </div>
            <button onClick={() => openEdit(b)} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Pencil size={12} /> Edit
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!editing} title={editing?._id ? "Edit Bank" : "Register Bank"} onClose={() => setEditing(null)}>
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Bank name (e.g. Landbank)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <div>
            <label className="text-xs font-semibold text-slate-600">Logo (PNG/JPG, ≤200KB)</label>
            <div className="mt-1 flex items-center gap-3">
              {form.logo && <img src={form.logo} alt="logo" className="h-12 w-12 rounded-lg object-contain border border-slate-200" />}
              <input type="file" accept="image/*" onChange={pickLogo} className="text-xs" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Active (selectable when adding accounts)
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancel</button>
            <button onClick={save} className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700">Save</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
