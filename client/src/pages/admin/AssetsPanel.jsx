import { useEffect, useMemo, useState } from "react";
import Card from "../../components/Card";
import Modal from "../../components/Modal";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Plus, Pencil, Trash2, RefreshCw, ClipboardCheck, AlertTriangle } from "lucide-react";

const PAGE_SIZE = 20;
const STATUSES = ["in_use", "in_storage", "for_repair", "disposed"];
const CONDITIONS = ["good", "fair", "poor", "damaged"];
const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";

function dstr(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}
function isDue(a) {
  if (a.status === "disposed") return false;
  if (!a.lastAuditedAt) return true;
  return a.nextAuditDue && new Date(a.nextAuditDue) <= new Date();
}
const EMPTY = {
  assetTag: "", category: "", name: "", brand: "", model: "", serialNumber: "", specs: "",
  assignedTo: "", location: "", status: "in_use", condition: "good", acquisitionDate: "", value: "", notes: "",
};

function L({ label, children }) {
  return <div><label className="text-xs font-semibold text-slate-600">{label}</label>{children}</div>;
}

export default function AssetsPanel() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [auditFor, setAuditFor] = useState(null);
  const [audit, setAudit] = useState({ present: true, condition: "good", notes: "" });

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => { apiFetch("/assets/categories", { token }).then(setCats).catch(() => {}); }, [token]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ q, category, status, due: dueOnly ? "1" : "", page: String(page), limit: String(PAGE_SIZE) });
      const data = await apiFetch(`/assets?${qs}`, { token });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setDueCount(data.dueCount || 0);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, category, status, dueOnly, page]);

  function openAdd() { setEditing(null); setForm(EMPTY); setErr(""); setOpen(true); }
  function openEdit(a) {
    setEditing(a);
    setForm({ ...EMPTY, ...a, acquisitionDate: dstr(a.acquisitionDate), value: String(a.value ?? "") });
    setErr(""); setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.category) return setErr("Name and category are required.");
    setErr(""); setSaving(true);
    try {
      const body = { ...form, value: Number(form.value) || 0 };
      if (!body.acquisitionDate) delete body.acquisitionDate;
      if (editing) await apiFetch(`/assets/${editing._id}`, { method: "PUT", token, body });
      else await apiFetch("/assets", { method: "POST", token, body });
      setOpen(false);
      flash(editing ? "Asset updated." : "Asset added.");
      await load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }
  async function remove(a) {
    if (!confirm(`Delete asset ${a.name} (${a.assetTag})?`)) return;
    try { await apiFetch(`/assets/${a._id}`, { method: "DELETE", token }); flash("Deleted."); await load(); }
    catch (e) { setErr(e.message); }
  }
  function openAudit(a) { setAuditFor(a); setAudit({ present: true, condition: a.condition || "good", notes: "" }); }
  async function submitAudit() {
    try {
      await apiFetch(`/assets/${auditFor._id}/audit`, { method: "POST", token, body: audit });
      setAuditFor(null);
      flash("Audit recorded. Next due in 6 months.");
      await load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold tracking-tight text-slate-900">
            Asset Inventory {dueCount > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{dueCount} due for audit</span>}
          </div>
          <div className="mt-0.5 text-sm text-slate-500">Equipment & devices with serial, specs, assignment, and 6-month audits.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
          <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Plus size={16} /> Add Asset</button>
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>}
      {toast && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} placeholder="Search name / serial / assignee / tag" className="w-full sm:w-64 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <select value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
          <option value="">All status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <button onClick={() => { setPage(1); setDueOnly((v) => !v); }} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${dueOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Due for audit</button>
      </div>

      <div className="mt-4 overflow-auto rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Serial / Model</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3">Audit</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-500">No assets.</td></tr>
            ) : (
              items.map((a) => (
                <tr key={a._id} className="border-t align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{a.name}</div>
                    <div className="text-xs text-slate-500">{a.assetTag} • {a.category}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600"><div className="font-mono text-xs">{a.serialNumber || "—"}</div><div className="text-xs text-slate-400">{a.brand} {a.model}</div></td>
                  <td className="px-4 py-3 text-slate-600">{a.assignedTo || "—"}<div className="text-xs capitalize text-slate-400">{a.status?.replace("_", " ")}</div></td>
                  <td className="px-4 py-3 capitalize text-slate-600">{a.condition}</td>
                  <td className="px-4 py-3">
                    {isDue(a) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700"><AlertTriangle size={11} /> Due</span>
                    ) : (
                      <span className="text-xs text-slate-500">{a.lastAuditedAt ? new Date(a.lastAuditedAt).toLocaleDateString() : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openAudit(a)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" title="Record audit"><ClipboardCheck size={14} /></button>
                    <button onClick={() => openEdit(a)} className="mr-1 inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(a)} className="inline-flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <div>{total} total</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* Add/Edit */}
      <Modal open={open} title={editing ? "Edit Asset" : "Add Asset"} onClose={() => setOpen(false)} size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <L label="Asset Tag"><input value={form.assetTag} onChange={(e) => set("assetTag", e.target.value)} placeholder="auto if blank" className={`mt-1 ${inputCls}`} /></L>
          <L label="Category *">
            <input list="asset-cats" value={form.category} onChange={(e) => set("category", e.target.value)} className={`mt-1 ${inputCls}`} />
            <datalist id="asset-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </L>
          <L label="Name / Description *"><input value={form.name} onChange={(e) => set("name", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Serial Number"><input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Brand"><input value={form.brand} onChange={(e) => set("brand", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Model"><input value={form.model} onChange={(e) => set("model", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <div className="sm:col-span-2"><L label="Full Specs"><textarea rows={2} value={form.specs} onChange={(e) => set("specs", e.target.value)} placeholder="CPU, RAM, storage, OS, etc." className={`mt-1 ${inputCls}`} /></L></div>
          <L label="Assigned To"><input value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="Person / office" className={`mt-1 ${inputCls}`} /></L>
          <L label="Location"><input value={form.location} onChange={(e) => set("location", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Status"><select value={form.status} onChange={(e) => set("status", e.target.value)} className={`mt-1 ${inputCls}`}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></L>
          <L label="Condition"><select value={form.condition} onChange={(e) => set("condition", e.target.value)} className={`mt-1 ${inputCls}`}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></L>
          <L label="Acquisition Date"><input type="date" value={form.acquisitionDate} onChange={(e) => set("acquisitionDate", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <L label="Value (₱)"><input type="number" step="0.01" value={form.value} onChange={(e) => set("value", e.target.value)} className={`mt-1 ${inputCls}`} /></L>
          <div className="sm:col-span-2"><L label="Notes"><input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`mt-1 ${inputCls}`} /></L></div>
        </div>
        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving…" : editing ? "Update" : "Save"}</button>
        </div>
      </Modal>

      {/* Audit */}
      <Modal open={!!auditFor} title="Record Audit" subtitle={auditFor ? `${auditFor.name} • ${auditFor.assetTag}` : ""} onClose={() => setAuditFor(null)} size="sm">
        <div className="space-y-3">
          <L label="Is the asset present?">
            <select value={audit.present ? "yes" : "no"} onChange={(e) => setAudit((p) => ({ ...p, present: e.target.value === "yes" }))} className={`mt-1 ${inputCls}`}>
              <option value="yes">Yes — present</option>
              <option value="no">No — missing</option>
            </select>
          </L>
          <L label="Condition"><select value={audit.condition} onChange={(e) => setAudit((p) => ({ ...p, condition: e.target.value }))} className={`mt-1 ${inputCls}`}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></L>
          <L label="Notes"><textarea rows={2} value={audit.notes} onChange={(e) => setAudit((p) => ({ ...p, notes: e.target.value }))} className={`mt-1 ${inputCls}`} /></L>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAuditFor(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button>
            <button onClick={submitAudit} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Save Audit</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
